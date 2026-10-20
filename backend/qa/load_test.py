"""Response-time and concurrency check against a RUNNING server (thesis 3.8, Performance Testing).

    python qa/load_test.py --url http://127.0.0.1:8000 --email admin@x --password ... [--users 10] [--seconds 20]

Uses only the standard library. Step 1 times each endpoint alone (single user: median and 95th percentile of 20 calls).
Step 2 runs N users at once, each looping over the endpoints for the given time, and reports requests per second,
error rate and latency percentiles.
"""
import argparse
import json
import statistics
import threading
import time
import urllib.error
import urllib.request

ENDPOINTS = ["/api/analytics/overview/", "/api/analytics/live/", "/api/analytics/sales/", "/api/analytics/inventory/",
             "/api/analytics/forecast/", "/api/analytics/report/", "/api/patients/?page=1&pageSize=25",
             "/api/inventory/", "/api/events/posts/", "/api/requests/"]


def call(base, path, token=None, body=None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            return r.status, time.perf_counter() - start, payload
    except urllib.error.HTTPError as e:
        return e.code, time.perf_counter() - start, b""
    except Exception:
        return 0, time.perf_counter() - start, b""


def pct(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * p))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--users", type=int, default=10)
    ap.add_argument("--seconds", type=int, default=20)
    a = ap.parse_args()

    logins = [call(a.url, "/api/auth/login/", body={"email": a.email, "password": a.password}) for _ in range(5)]
    status, _, payload = logins[0]
    if status != 200:
        raise SystemExit(f"Login failed ({status}).")
    token = json.loads(payload)["access"]
    print(f"login: median {statistics.median(t for _, t, _ in logins) * 1000:.0f} ms over {len(logins)} calls\n")

    print("Single user (20 calls each)\nendpoint | median ms | p95 ms | status")
    for path in ENDPOINTS:
        runs = [call(a.url, path, token) for _ in range(20)]
        times = [t * 1000 for _, t, _ in runs]
        print(f"{path} | {statistics.median(times):.0f} | {pct(times, 0.95):.0f} | {runs[-1][0]}")

    print(f"\n{a.users} users at once for {a.seconds} s")
    times, errors, throttled, lock = [], [0], [0], threading.Lock()
    stop = time.time() + a.seconds

    def worker():
        i = 0
        while time.time() < stop:
            s, t, _ = call(a.url, ENDPOINTS[i % len(ENDPOINTS)], token)
            i += 1
            with lock:
                times.append(t * 1000)
                if s == 429:
                    throttled[0] += 1  # the API's per-user rate limit (1500/min) doing its job, not a failure
                elif s != 200:
                    errors[0] += 1

    threads = [threading.Thread(target=worker) for _ in range(a.users)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    print(f"requests: {len(times)}  ({len(times) / a.seconds:.1f}/s)  errors: {errors[0]} ({errors[0] / max(1, len(times)) * 100:.1f}%)  rate-limited: {throttled[0]}")
    print(f"latency ms: median {statistics.median(times):.0f}, p95 {pct(times, 0.95):.0f}, max {max(times):.0f}")


if __name__ == "__main__":
    main()

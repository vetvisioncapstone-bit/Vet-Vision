import subprocess

from django.conf import settings
from django.core.management import call_command


def test_backup_writes_a_dump_and_prunes_old_ones(tmp_path, monkeypatch):
    calls = []

    def fake_run(cmd, **kw):
        calls.append((cmd, kw["env"]["PGPASSWORD"]))
        open(cmd[cmd.index("-f") + 1], "wb").write(b"dump")
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setattr("core.management.commands.backup_db.find_pg_dump", lambda: "pg_dump")
    name = settings.DATABASES["default"]["NAME"]  # "test_..." once a database test has run in this session
    for stamp in ("20200101_000000", "20200102_000000", "20200103_000000"):
        (tmp_path / f"{name}_{stamp}.dump").write_bytes(b"old")
    call_command("backup_db", "--dir", str(tmp_path), "--keep", "2")
    files = sorted(p.name for p in tmp_path.glob("*.dump"))
    assert len(files) == 2 and f"{name}_20200101_000000.dump" not in files  # oldest pruned, newest kept
    assert calls and "-Fc" in calls[0][0]

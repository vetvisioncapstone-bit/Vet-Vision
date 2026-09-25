"""Back up the database with pg_dump and keep only the newest copies.

    python manage.py backup_db                 # writes backups/vetvision_YYYYMMDD_HHMMSS.dump
    python manage.py backup_db --keep 30       # keep 30 copies instead of 14

Restore into an empty database with:  pg_restore --clean --if-exists -d <db> <file>
Schedule it daily (Windows Task Scheduler / cron) to satisfy the thesis "backup and recovery" requirement.
"""
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

WINDOWS_DEFAULTS = sorted(Path("C:/Program Files/PostgreSQL").glob("*/bin/pg_dump.exe"), reverse=True)


def find_pg_dump():
    found = os.getenv("PG_DUMP") or shutil.which("pg_dump") or (str(WINDOWS_DEFAULTS[0]) if WINDOWS_DEFAULTS else None)
    if not found:
        raise CommandError("pg_dump not found. Install PostgreSQL client tools or set PG_DUMP to its full path.")
    return found


class Command(BaseCommand):
    help = "Dump the database to backups/ and delete all but the newest --keep copies."

    def add_arguments(self, parser):
        parser.add_argument("--keep", type=int, default=14)
        parser.add_argument("--dir", default=str(settings.BASE_DIR / "backups"))

    def handle(self, *args, keep, dir, **_):
        db = settings.DATABASES["default"]
        out_dir = Path(dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / f"{db['NAME']}_{datetime.now():%Y%m%d_%H%M%S}.dump"
        cmd = [find_pg_dump(), "-h", db["HOST"], "-p", str(db["PORT"]), "-U", db["USER"], "-Fc", "-f", str(target), db["NAME"]]
        result = subprocess.run(cmd, env={**os.environ, "PGPASSWORD": db["PASSWORD"]}, capture_output=True, text=True)
        if result.returncode != 0:
            target.unlink(missing_ok=True)
            raise CommandError(f"pg_dump failed: {result.stderr.strip()[:300]}")
        old = sorted(out_dir.glob(f"{db['NAME']}_*.dump"), reverse=True)[keep:]
        for f in old:
            f.unlink()
        self.stdout.write(self.style.SUCCESS(f"Backup written: {target} ({target.stat().st_size // 1024} KB); removed {len(old)} old"))

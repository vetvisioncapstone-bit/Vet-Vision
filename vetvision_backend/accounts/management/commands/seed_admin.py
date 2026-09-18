"""Bootstrap the very first admin login.

Every staff/customer row in the seeded dataset has username=NULL,
password_hash=NULL — there are no accounts yet. Run this once:

    python manage.py seed_admin

It reads SEED_ADMIN_STAFF_ID / SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD
from .env and sets that staff row's username + password_hash + role (forced
into settings.ADMIN_JOB_ROLES so the account actually gets admin
permissions). No credentials are hardcoded in source.
"""

import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.models import Staff


class Command(BaseCommand):
    help = "Create/update the first admin staff login from .env settings."

    def handle(self, *args, **options):
        staff_id = os.getenv("SEED_ADMIN_STAFF_ID")
        username = os.getenv("SEED_ADMIN_USERNAME")
        password = os.getenv("SEED_ADMIN_PASSWORD")

        if not all([staff_id, username, password]):
            raise CommandError(
                "Set SEED_ADMIN_STAFF_ID, SEED_ADMIN_USERNAME and "
                "SEED_ADMIN_PASSWORD in .env first."
            )

        try:
            staff = Staff.objects.get(staff_id=staff_id)
        except Staff.DoesNotExist as exc:
            raise CommandError(
                f"No staff row with staff_id={staff_id!r}. Pick an existing "
                "id from `SELECT staff_id, staff_name FROM staff;` in pgAdmin."
            ) from exc

        admin_role = next(iter(settings.ADMIN_JOB_ROLES), "Administrator")
        staff.username = username
        staff.role = admin_role
        staff.is_active = True
        staff.set_password(password)
        staff.save(update_fields=["username", "role", "is_active", "password_hash"])

        self.stdout.write(
            self.style.SUCCESS(
                f"{staff.staff_name} ({staff.staff_id}) can now log in as "
                f"'{username}' with role '{admin_role}'."
            )
        )

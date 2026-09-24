import getpass
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User


class Command(BaseCommand):
    help = "Create (or reset the password of) the clinic owner/admin account. No default password is ever stored in code."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument("--password", help="Prefer the ADMIN_PASSWORD env var or the interactive prompt.")

    def handle(self, *args, email, name, password=None, **opts):
        password = password or os.getenv("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
        try:
            validate_password(password)
        except ValidationError as e:
            raise CommandError("; ".join(e.messages))
        email = email.strip().lower()
        user, created = User.objects.get_or_create(email=email, defaults={"name": name, "role": User.ROLE_ADMIN})
        user.name, user.role, user.is_active = name, User.ROLE_ADMIN, True
        user.is_staff = user.is_superuser = True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Admin {'created' if created else 'updated'}: {email}"))

import re
import unicodedata

from django.contrib.auth.hashers import make_password
from django.core.management import BaseCommand
from django.db import transaction

from clinic.models import Customer


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", text.lower())


class Command(BaseCommand):
    help = (
        "Fill empty customer.first_name / last_name (split from customer_name), email "
        "(first.last@gmail.com) and password_hash. Only touches NULL fields; safe to re-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--password", default="password", help="Initial password for customers without one.")

    def handle(self, *args, password, **opts):
        hashed = make_password(password)
        customers = list(Customer.objects.order_by("customer_id"))
        taken = {c.email.lower() for c in customers if c.email}
        changed = []

        for c in customers:
            parts = c.customer_name.split()
            if not c.first_name:
                c.first_name = " ".join(parts[:-1]) if len(parts) > 1 else parts[0]
            if not c.last_name and len(parts) > 1:
                c.last_name = parts[-1]
            if not c.email:
                base = ".".join(x for x in (slug(c.first_name or ""), slug(c.last_name or "")) if x) or "customer"
                email, n = f"{base}@gmail.com", 1
                while email in taken:  # same name, different customer: add a number
                    n += 1
                    email = f"{base}{n}@gmail.com"
                taken.add(email)
                c.email = email
            if not c.password_hash:
                c.password_hash = hashed
            changed.append(c)

        with transaction.atomic():
            Customer.objects.bulk_update(changed, ["first_name", "last_name", "email", "password_hash"], batch_size=500)
        self.stdout.write(self.style.SUCCESS(f"Updated {len(changed)} customers."))

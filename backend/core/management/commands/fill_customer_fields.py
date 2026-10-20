from django.core.management import BaseCommand
from django.db import transaction

from clinic.models import Customer


class Command(BaseCommand):
    help = (
        "Fill empty customer.first_name / last_name (split from customer_name). Only touches NULL fields; safe to "
        "re-run. It invents no emails or passwords: customer accounts come only from owners registering."
    )

    def handle(self, *args, **opts):
        customers = list(Customer.objects.order_by("customer_id"))
        changed = []

        for c in customers:
            parts = c.customer_name.split()
            if not c.first_name:
                c.first_name = " ".join(parts[:-1]) if len(parts) > 1 else parts[0]
            if not c.last_name and len(parts) > 1:
                c.last_name = parts[-1]
            changed.append(c)

        with transaction.atomic():
            Customer.objects.bulk_update(changed, ["first_name", "last_name"], batch_size=500)
        self.stdout.write(self.style.SUCCESS(f"Updated {len(changed)} customers."))

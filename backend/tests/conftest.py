from datetime import date

import pytest
from rest_framework.test import APIClient

from accounts.models import User
from clinic.models import Branch, Staff
from inventory.models import Inventory, Product, ProductBranchPrice

PASSWORD = "Str0ng!Passw0rd"


@pytest.fixture
def branches(db):
    ibaan = Branch.objects.create(branch_id="BR-001", branch_name="EcoVet Animal Clinic", town="Ibaan",
                                  address="Ibaan", date_opened=date(2021, 7, 8))
    sanjose = Branch.objects.create(branch_id="BR-002", branch_name="Petalooma", town="San Jose",
                                    address="San Jose", date_opened=date(2025, 7, 29))
    return ibaan, sanjose


@pytest.fixture
def admin(db):
    return User.objects.create_superuser("owner@ecovet.ph", PASSWORD, name="Owner Admin")


def make_staff(branch, staff_id, email):
    st = Staff.objects.create(staff_id=staff_id, branch=branch, staff_name=f"Staff {staff_id}", role="Receptionist",
                              email=email, is_active=True)
    return User.objects.create_user(email, PASSWORD, name=st.staff_name, role="staff", staff=st)


@pytest.fixture
def staff_ibaan(branches):
    return make_staff(branches[0], "STF-001", "ana@ecovet.ph")


@pytest.fixture
def staff_sanjose(branches):
    return make_staff(branches[1], "STF-002", "ben@ecovet.ph")


@pytest.fixture
def api():
    return APIClient()


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def stocked(branches):
    """One product stocked at both branches (10 in Ibaan, 5 in San Jose)."""
    p = Product.objects.create(product_id="PRD-0001", product_name="Dog Food 5kg", category="Food")
    ProductBranchPrice.objects.create(product=p, branch=branches[0], unit_price=250, unit_capital=180)
    a = Inventory.objects.create(inventory_id="INV-000001", product=p, branch=branches[0],
                                 quantity_on_hand=10, reorder_point=3)
    b = Inventory.objects.create(inventory_id="INV-000002", product=p, branch=branches[1],
                                 quantity_on_hand=5, reorder_point=3)
    return a, b

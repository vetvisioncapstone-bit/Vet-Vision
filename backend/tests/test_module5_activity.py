"""Module 5 Activity 2 ("Test Your Capstone System"): the functional, regression and security test cases for the
Sales module (with Inventory, Login and the Dashboard it feeds), run against the real API on a fresh test database.

Run:  .venv\\Scripts\\python -m pytest tests/test_module5_activity.py -v -s
Each test prints the ACTUAL result that goes into docs/qa/Module5_Activity2_Test_Report.docx.
"""
import pytest

from clinic.models import Customer
from inventory.models import Inventory, InventoryTransaction, Product, ProductBranchPrice
from sales.models import Sale

from .conftest import PASSWORD, client_for

SALES = "/api/sales/"


def actual(test_id, text):
    print(f"\n[{test_id}] ACTUAL: {text}")


def first(error):
    return str(error[0] if isinstance(error, list) else error)


def stock(inv):
    inv.refresh_from_db()
    return int(inv.quantity_on_hand)


@pytest.fixture
def owner(branches):
    return Customer.objects.create(customer_id="CUS-I9001", branch=branches[0], customer_name="Test Owner")


@pytest.fixture
def two_products(stocked, branches):
    """Dog Food 5kg (P250, 10 in stock at Ibaan) plus Cat Litter 10L (P180, 6 in stock at Ibaan)."""
    p = Product.objects.create(product_id="PRD-0002", product_name="Cat Litter 10L", category="Supplies")
    ProductBranchPrice.objects.create(product=p, branch=branches[0], unit_price=180, unit_capital=120)
    litter = Inventory.objects.create(inventory_id="INV-000003", product=p, branch=branches[0],
                                      quantity_on_hand=6, reorder_point=2)
    return stocked[0], litter


# ------------------------------- 1. functional -------------------------------


def test_FT01_process_a_sale_with_sufficient_stock(staff_ibaan, two_products):
    food, litter = two_products
    r = client_for(staff_ibaan).post(SALES, {"items": [
        {"inventoryId": food.inventory_id, "quantity": 2, "price": 250},
        {"inventoryId": litter.inventory_id, "quantity": 1, "price": 180}]}, format="json")
    assert r.status_code == 201 and r.data["total"] == 680.0
    listed = client_for(staff_ibaan).get(SALES).data
    assert listed[0]["id"] == r.data["id"]
    actual("FT-01", f"HTTP {r.status_code}; sale {r.data['id']} saved with total P{r.data['total']:,.2f} and listed "
                    f"first in Recent sales.")


def test_FT02_inventory_decreases_after_the_sale(staff_ibaan, two_products):
    food, _ = two_products
    before = stock(food)
    client_for(staff_ibaan).post(SALES, {"items": [{"inventoryId": food.inventory_id, "quantity": 2, "price": 250}]},
                                 format="json")
    after = stock(food)
    move = InventoryTransaction.objects.get(product=food.product, branch=food.branch, txn_type="sale")
    assert (before, after, int(move.quantity_change)) == (10, 8, -2)
    actual("FT-02", f"Dog Food 5kg stock went from {before} to {after}; a 'sale' stock movement of "
                    f"{int(move.quantity_change)} was logged.")


def test_FT03_selling_more_than_the_stock_is_refused(staff_ibaan, two_products):
    _, litter = two_products
    r = client_for(staff_ibaan).post(SALES, {"items": [{"inventoryId": litter.inventory_id, "quantity": 8,
                                                        "price": 180}]}, format="json")
    assert r.status_code == 400 and "left in stock" in first(r.data["items"])
    assert Sale.objects.count() == 0 and stock(litter) == 6
    actual("FT-03", f"HTTP {r.status_code}: \"{first(r.data['items'])}\"; no sale saved, stock still {stock(litter)}.")


# ------------------------------- 2. regression -------------------------------
# Change under test: commit fa48a22 linked a sale to an owner (optional customerId) and pre-fills the price from the
# product's branch price. These existing functions must still work.


def test_RT01_total_calculation_still_correct_with_an_owner_linked(staff_ibaan, two_products, owner):
    food, litter = two_products
    r = client_for(staff_ibaan).post(SALES, {"customerId": owner.customer_id, "items": [
        {"inventoryId": food.inventory_id, "quantity": 3, "price": 250},
        {"inventoryId": litter.inventory_id, "quantity": 2, "price": 180}]}, format="json")
    assert r.status_code == 201 and r.data["total"] == 1110.0 and r.data["customerName"] == "Test Owner"
    actual("RT-01", f"Total P{r.data['total']:,.2f} (3 x P250 + 2 x P180); sale shows owner "
                    f"\"{r.data['customerName']}\".")


def test_RT02_inventory_deduction_still_works_for_owner_and_walk_in_sales(staff_ibaan, two_products, owner):
    food, _ = two_products
    c = client_for(staff_ibaan)
    c.post(SALES, {"customerId": owner.customer_id, "items": [{"inventoryId": food.inventory_id, "quantity": 3,
                                                               "price": 250}]}, format="json")
    c.post(SALES, {"items": [{"inventoryId": food.inventory_id, "quantity": 1, "price": 250}]}, format="json")
    assert stock(food) == 6
    actual("RT-02", f"Stock 10 -> {stock(food)} after an owner sale of 3 and a walk-in sale of 1.")


def test_RT03_dashboard_still_counts_the_sales(staff_ibaan, admin, two_products, owner):
    food, _ = two_products
    c = client_for(staff_ibaan)
    c.post(SALES, {"customerId": owner.customer_id, "items": [{"inventoryId": food.inventory_id, "quantity": 2,
                                                               "price": 250}]}, format="json")
    c.post(SALES, {"items": [{"inventoryId": food.inventory_id, "quantity": 1, "price": 250}]}, format="json")
    live = client_for(admin).get("/api/analytics/live/").data
    ibaan = live["byBranch"]["Ibaan"]
    assert (ibaan["sales"], ibaan["saleTxns"]) == (750.0, 2)
    actual("RT-03", f"Admin dashboard (today, Ibaan): product sales P{ibaan['sales']:,.2f} from {ibaan['saleTxns']} "
                    f"transactions; both the owner and the walk-in sale counted.")


# ------------------------------- 5. security -------------------------------


def test_ST01_login_with_a_wrong_password_is_denied(api, staff_ibaan):
    r = api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": "WrongPass123"}, format="json")
    assert r.status_code == 401 and "access" not in r.data
    ok = api.post("/api/auth/login/", {"email": "ana@ecovet.ph", "password": PASSWORD}, format="json")
    assert ok.status_code == 200
    actual("ST-01", f"HTTP {r.status_code}: \"{r.data['detail']}\"; no token issued (the correct password then "
                    f"works: HTTP {ok.status_code}).")


def test_ST02_staff_cannot_open_admin_only_pages(staff_ibaan):
    c = client_for(staff_ibaan)
    codes = {url: c.get(url).status_code for url in ("/api/staff-accounts/", "/api/analytics/overview/")}
    assert set(codes.values()) == {403}
    actual("ST-02", "Staff account got HTTP 403 \"You do not have permission to perform this action.\" for User "
                    f"Management ({codes['/api/staff-accounts/']}) and the admin Dashboard "
                    f"({codes['/api/analytics/overview/']}).")


def test_ST03_negative_quantity_is_rejected(staff_ibaan, two_products):
    food, _ = two_products
    r = client_for(staff_ibaan).post(SALES, {"items": [{"inventoryId": food.inventory_id, "quantity": -5,
                                                        "price": 250}]}, format="json")
    message = r.data["items"][0]["quantity"][0]
    assert r.status_code == 400 and Sale.objects.count() == 0 and stock(food) == 10
    actual("ST-03", f"HTTP {r.status_code}: \"{message}\"; no sale saved, stock unchanged ({stock(food)}).")


def test_ST04_staff_cannot_sell_another_branchs_stock(staff_ibaan, stocked):
    san_jose_stock = stocked[1]
    r = client_for(staff_ibaan).post(SALES, {"items": [{"inventoryId": san_jose_stock.inventory_id, "quantity": 1,
                                                        "price": 250}]}, format="json")
    assert r.status_code == 400 and stock(san_jose_stock) == 5
    actual("ST-04", f"HTTP {r.status_code}: \"{first(r.data['items'])}\"; San Jose stock unchanged.")

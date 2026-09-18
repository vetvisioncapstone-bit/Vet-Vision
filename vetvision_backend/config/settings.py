"""
Django settings for the VetVision backend.

Built against the real pgAdmin/PostgreSQL schema (17 tables, verified by
loading vetvisiondb.sql into a scratch Postgres instance and diffing row
counts). All of the operational tables (branch, staff, customer, pet,
product, service, sale, sale_detail, service_transaction, service_detail,
inventory, inventory_transaction, medical_record, notification, and the
pricing/usage join tables) are modeled as `managed = False` — Django never
runs migrations against them, it just maps onto what already exists so we
never risk clobbering the seeded dataset or the existing triggers/views.

No new tables are introduced. Login writes directly to the existing
`staff.username` / `staff.password_hash` and `customer.email` /
`customer.password_hash` columns (they exist in the dump but are all NULL
right now — nobody has an account yet). RBAC above the job-title level
(`staff.role` holds things like "Veterinarian", "Secretary") is handled in
config via ADMIN_JOB_ROLES below rather than by altering the schema — see
accounts/authentication.py and accounts/permissions.py.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = os.getenv("DEBUG", "True") == "True"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "corsheaders",
    "branches",
    "accounts",
    "catalog",
    "inventory",
    "sales",
    "service_ops",
    "patients",
    "communications",
    "analytics",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "vetvisiondb"),
        "USER": os.getenv("DB_USER", "postgres"),
        "PASSWORD": os.getenv("DB_PASSWORD", "postgres"),
        "HOST": os.getenv("DB_HOST", "localhost"),
        "PORT": os.getenv("DB_PORT", "5432"),
    }
}

# There's no Django auth_user table in this schema — login is fully custom
# against `staff` / `customer` (see accounts/authentication.py), so
# AUTH_USER_MODEL is left at Django's default and django.contrib.auth's own
# tables are simply never used or migrated. contenttypes+auth are kept
# installed only because djangorestframework-simplejwt imports expect them
# to be present in INSTALLED_APPS.
AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Manila"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "accounts.authentication.VetVisionJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

# Roles considered "management" for endpoints that need more than plain
# staff access (branch KPI comparisons, user management, etc.). Adjust
# freely — this is config, not schema, since staff.role stores job titles.
ADMIN_JOB_ROLES = {"Owner", "Branch Manager", "Administrator"}

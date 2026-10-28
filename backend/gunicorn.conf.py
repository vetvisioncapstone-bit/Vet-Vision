# Gunicorn reads this file on its own when it starts in backend/, so Railway's default Django start command
# (python manage.py migrate && gunicorn config.wsgi:application) picks it up with no host-specific config file.
import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
# One worker (with threads): rate-limit counters and the forecast cache live in process memory, so a second
# worker would count separately and double every limit. Add a shared cache before adding workers.
workers = 1
threads = 4
timeout = 60  # an AI assistant answer can take up to 45 seconds

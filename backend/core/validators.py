import re

from rest_framework import serializers

# Photos, blood-test results and waivers are stored as base64 data URLs (see settings.DATA_UPLOAD_MAX_MEMORY_SIZE).
_DATA_URL = re.compile(r"^data:(image/(png|jpe?g|webp|gif)|application/pdf);base64,")
MAX_DATA_URL_CHARS = 8_000_000  # about a 6 MB file


def data_url(value):
    """Accept only an image or PDF data URL of a sane size. Empty values are skipped by the field itself."""
    if not _DATA_URL.match(value):
        raise serializers.ValidationError("Upload a PNG, JPG, WebP, GIF or PDF file.")
    if len(value) > MAX_DATA_URL_CHARS:
        raise serializers.ValidationError("That file is too large (6 MB maximum).")
    return value

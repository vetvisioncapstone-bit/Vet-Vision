from django.apps import AppConfig


class AnalyticsConfig(AppConfig):
    name = "analytics"

    def ready(self):
        # pandas and scikit-learn take a few seconds to import; pay that when the server starts,
        # not on the first person's first click.
        from . import forecast  # noqa: F401

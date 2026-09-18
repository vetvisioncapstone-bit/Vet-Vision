from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    branch = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "notification_id",
            "branch",
            "customer",
            "staff",
            "notification_type",
            "service_type",
            "message_text",
            "created_at",
            "sent_at",
            "read_at",
            "status",
            "delivery_method",
        ]
        read_only_fields = ["notification_id", "created_at"]

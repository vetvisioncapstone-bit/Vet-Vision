from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsCustomer, IsStaff
from common.id_generators import next_id

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    """Staff can create/broadcast notifications; customers can only see
    and mark-read their own (see get_queryset / the `mark_read` action)."""

    serializer_class = NotificationSerializer
    permission_classes = [IsStaff | IsCustomer]

    def get_queryset(self):
        qs = Notification.objects.select_related("branch", "customer", "staff").all()
        user = self.request.user
        if getattr(user, "user_type", None) == "customer":
            return qs.filter(customer_id=user.customer_id)
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        return qs

    def perform_create(self, serializer):
        branch = serializer.validated_data.get("branch") or self.request.user.branch
        notif_id = next_id(Notification, "notification_id", "NOT-{b}-", width=6, branch=branch)
        serializer.save(
            notification_id=notif_id, branch=branch, created_at=timezone.now(), status="Pending"
        )

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.read_at = timezone.now()
        notification.status = "Read"
        notification.save(update_fields=["read_at", "status"])
        return Response(NotificationSerializer(notification).data)

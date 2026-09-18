from rest_framework import serializers

from .models import Customer, Staff


class StaffLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class CustomerLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)


class StaffMeSerializer(serializers.ModelSerializer):
    is_admin = serializers.BooleanField(read_only=True)
    # `branch` is a ForeignKey field on the model, not `branch_id` — but
    # Django exposes the raw column as `.branch_id` on any FK, so this
    # explicit declaration (rather than relying on ModelSerializer's
    # auto-detection, which only knows the field name `branch`) is what
    # lets "branch_id" appear directly in the response.
    branch_id = serializers.CharField(read_only=True)

    class Meta:
        model = Staff
        fields = ["staff_id", "staff_name", "role", "branch_id", "email", "is_admin"]


class CustomerMeSerializer(serializers.ModelSerializer):
    branch_id = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = ["customer_id", "customer_name", "branch_id", "email", "contact_no"]

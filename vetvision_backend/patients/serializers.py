from rest_framework import serializers

from .models import MedicalRecord, Pet


class PetSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.customer_name", read_only=True)

    class Meta:
        model = Pet
        fields = [
            "pet_id",
            "customer",
            "customer_name",
            "pet_name",
            "species",
            "breed",
            "sex",
            "color_marking",
            "date_of_birth",
            "weight_kg",
        ]
        read_only_fields = ["pet_id"]


class MedicalRecordSerializer(serializers.ModelSerializer):
    pet_name = serializers.CharField(source="pet.pet_name", read_only=True)
    staff_name = serializers.CharField(source="staff.staff_name", read_only=True, default=None)
    branch = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = MedicalRecord
        fields = [
            "record_id",
            "pet",
            "pet_name",
            "branch",
            "staff",
            "staff_name",
            "record_date",
            "record_type",
            "diagnosis",
            "treatment",
            "remarks",
            "created_at",
        ]
        read_only_fields = ["record_id", "created_at"]

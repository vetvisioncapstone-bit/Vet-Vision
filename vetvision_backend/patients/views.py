from rest_framework import viewsets

from accounts.permissions import IsStaff
from common.id_generators import next_id

from .models import MedicalRecord, Pet
from .serializers import MedicalRecordSerializer, PetSerializer


class PetViewSet(viewsets.ModelViewSet):
    """Pet registry, keyed to a customer/owner (accounts.Customer)."""

    queryset = Pet.objects.select_related("customer").all()
    serializer_class = PetSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        customer_id = self.request.query_params.get("customer_id")
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(pet_name__icontains=search)
        return qs

    def perform_create(self, serializer):
        customer = serializer.validated_data["customer"]
        pet_id = next_id(Pet, "pet_id", "PET-{b}", width=5, branch=customer.branch)
        serializer.save(pet_id=pet_id)


class MedicalRecordViewSet(viewsets.ModelViewSet):
    """Consultation/vaccination history for a pet — feeds both the vet's
    record-keeping and the customer portal's notification triggers."""

    queryset = MedicalRecord.objects.select_related("pet", "staff").all()
    serializer_class = MedicalRecordSerializer
    permission_classes = [IsStaff]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_admin:
            qs = qs.filter(branch_id=user.branch_id)
        pet_id = self.request.query_params.get("pet_id")
        if pet_id:
            qs = qs.filter(pet_id=pet_id)
        return qs

    def perform_create(self, serializer):
        branch = serializer.validated_data.get("branch") or self.request.user.branch
        record_id = next_id(MedicalRecord, "record_id", "MED-{b}-", width=6, branch=branch)
        serializer.save(record_id=record_id, branch=branch)

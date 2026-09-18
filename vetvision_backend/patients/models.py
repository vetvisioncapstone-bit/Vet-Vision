from django.db import models

from accounts.models import Customer, Staff
from branches.models import Branch


class Pet(models.Model):
    pet_id = models.CharField(primary_key=True, max_length=12)
    customer = models.ForeignKey(
        Customer, db_column="customer_id", on_delete=models.DO_NOTHING, related_name="pets"
    )
    pet_name = models.CharField(max_length=40)
    species = models.CharField(max_length=15, null=True, blank=True)
    breed = models.CharField(max_length=40, null=True, blank=True)
    sex = models.CharField(max_length=10, null=True, blank=True)
    color_marking = models.CharField(max_length=40, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta:
        managed = False
        db_table = "pet"
        ordering = ["pet_name"]

    def __str__(self):
        return self.pet_name


class MedicalRecord(models.Model):
    record_id = models.CharField(primary_key=True, max_length=14)
    pet = models.ForeignKey(
        Pet, db_column="pet_id", on_delete=models.CASCADE, related_name="medical_records"
    )
    branch = models.ForeignKey(Branch, db_column="branch_id", on_delete=models.DO_NOTHING)
    staff = models.ForeignKey(
        Staff, db_column="staff_id", on_delete=models.DO_NOTHING, null=True, blank=True
    )
    record_date = models.DateField()
    record_type = models.CharField(max_length=30, null=True, blank=True)
    diagnosis = models.CharField(max_length=200, null=True, blank=True)
    treatment = models.CharField(max_length=300, null=True, blank=True)
    remarks = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "medical_record"
        ordering = ["-record_date"]

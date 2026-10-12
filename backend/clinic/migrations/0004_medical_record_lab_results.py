from django.db import migrations, models


def to_list(apps, schema_editor):
    """The single blood-test picture becomes the first entry of the laboratory results list."""
    MedicalRecord = apps.get_model("clinic", "MedicalRecord")
    for r in MedicalRecord.objects.exclude(blood_test_image__isnull=True).exclude(blood_test_image="").iterator():
        r.lab_results = [{"name": r.blood_test_name or "laboratory-test-result", "image": r.blood_test_image}]
        r.save(update_fields=["lab_results"])


def to_single(apps, schema_editor):
    MedicalRecord = apps.get_model("clinic", "MedicalRecord")
    for r in MedicalRecord.objects.exclude(lab_results=[]).iterator():
        first = r.lab_results[0]
        r.blood_test_image, r.blood_test_name = first.get("image"), first.get("name")
        r.save(update_fields=["blood_test_image", "blood_test_name"])


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0003_medical_record_prescription'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicalrecord',
            name='lab_results',
            field=models.JSONField(blank=True, db_default=[], default=list),
        ),
        migrations.RunPython(to_list, to_single),
        migrations.RemoveField(model_name='medicalrecord', name='blood_test_image'),
        migrations.RemoveField(model_name='medicalrecord', name='blood_test_name'),
    ]

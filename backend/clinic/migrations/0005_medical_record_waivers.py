from django.db import migrations, models


def to_list(apps, schema_editor):
    """The single waiver file becomes the first entry of the waivers list."""
    MedicalRecord = apps.get_model("clinic", "MedicalRecord")
    for r in MedicalRecord.objects.exclude(waiver_image__isnull=True).exclude(waiver_image="").iterator():
        r.waivers = [{"name": r.waiver_name or "signed-waiver", "image": r.waiver_image}]
        r.save(update_fields=["waivers"])


def to_single(apps, schema_editor):
    MedicalRecord = apps.get_model("clinic", "MedicalRecord")
    for r in MedicalRecord.objects.exclude(waivers=[]).iterator():
        r.waiver_image, r.waiver_name = r.waivers[0].get("image"), r.waivers[0].get("name")
        r.save(update_fields=["waiver_image", "waiver_name"])


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0004_medical_record_lab_results'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicalrecord',
            name='waivers',
            field=models.JSONField(blank=True, db_default=[], default=list),
        ),
        migrations.RunPython(to_list, to_single),
        migrations.RemoveField(model_name='medicalrecord', name='waiver_image'),
        migrations.RemoveField(model_name='medicalrecord', name='waiver_name'),
    ]

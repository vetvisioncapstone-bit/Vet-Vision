from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('clinic', '0002_medical_record_source_txn'),
    ]

    operations = [
        migrations.AddField(
            model_name='medicalrecord',
            name='prescription',
            field=models.JSONField(blank=True, null=True),
        ),
    ]

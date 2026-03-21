from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_collectortransaction_mpesa_code"),
    ]

    operations = [
        migrations.AddField(
            model_name="collectionrequest",
            name="address_lat",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="collectionrequest",
            name="address_long",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=11, null=True),
        ),
    ]

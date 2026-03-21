from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_collectionrequest_coordinates"),
    ]

    operations = [
        migrations.AlterField(
            model_name="household",
            name="location_lat",
            field=models.DecimalField(decimal_places=8, max_digits=12, null=True),
        ),
        migrations.AlterField(
            model_name="household",
            name="location_long",
            field=models.DecimalField(decimal_places=8, max_digits=13, null=True),
        ),
        migrations.AlterField(
            model_name="collectionrequest",
            name="address_lat",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=12, null=True),
        ),
        migrations.AlterField(
            model_name="collectionrequest",
            name="address_long",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=13, null=True),
        ),
    ]

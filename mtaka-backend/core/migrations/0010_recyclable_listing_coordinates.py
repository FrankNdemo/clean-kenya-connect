from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0009_expand_coordinate_precision"),
    ]

    operations = [
        migrations.AddField(
            model_name="recyclablelisting",
            name="resident_location_lat",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name="recyclablelisting",
            name="resident_location_long",
            field=models.DecimalField(blank=True, decimal_places=8, max_digits=13, null=True),
        ),
    ]

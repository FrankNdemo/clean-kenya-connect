from django.db import migrations


def seed_waste_types(apps, schema_editor):
    WasteType = apps.get_model('core', 'WasteType')
    defaults = [
        ('General Waste', 'Non-recyclable household waste', False),
        ('Plastic', 'Plastic bottles, containers, bags', True),
        ('Paper', 'Paper, cardboard, newspapers', True),
        ('Metal', 'Aluminum cans, metal containers', True),
        ('Glass', 'Glass bottles, containers', True),
        ('Organic', 'Food waste, garden waste', True),
        ('Electronic', 'E-waste, electronics', True),
    ]
    for type_name, description, is_recyclable in defaults:
        WasteType.objects.get_or_create(
            type_name=type_name,
            defaults={'description': description, 'is_recyclable': is_recyclable},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_waste_types, migrations.RunPython.noop),
    ]

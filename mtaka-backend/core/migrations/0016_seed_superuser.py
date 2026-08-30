from django.db import migrations


def seed_superuser(apps, schema_editor):
    return None


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_event_cover_image_data'),
    ]

    operations = [
        migrations.RunPython(seed_superuser, migrations.RunPython.noop),
    ]

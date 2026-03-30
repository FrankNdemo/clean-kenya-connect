import base64
import mimetypes

from django.db import migrations, models


def _backfill_illegal_dumping_photo_data(apps, schema_editor):
    IllegalDumping = apps.get_model('core', 'IllegalDumping')

    for report in IllegalDumping.objects.exclude(photo='').exclude(photo__isnull=True).iterator():
        photo = getattr(report, 'photo', None)
        if not photo or not getattr(photo, 'name', ''):
            continue

        try:
            photo.open('rb')
            raw_bytes = photo.read()
        except Exception:
            continue
        finally:
            try:
                photo.close()
            except Exception:
                pass

        if not raw_bytes:
            continue

        report.photo_data = base64.b64encode(raw_bytes).decode('ascii')
        report.photo_content_type = mimetypes.guess_type(photo.name)[0] or 'application/octet-stream'
        report.save(update_fields=['photo_data', 'photo_content_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_eventschedulechange'),
    ]

    operations = [
        migrations.AddField(
            model_name='illegaldumping',
            name='photo_content_type',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='illegaldumping',
            name='photo_data',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(_backfill_illegal_dumping_photo_data, migrations.RunPython.noop),
    ]

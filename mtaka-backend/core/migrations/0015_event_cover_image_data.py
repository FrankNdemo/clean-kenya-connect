from django.db import migrations, models
import base64
import mimetypes


def _backfill_event_cover_image_data(apps, schema_editor):
    Event = apps.get_model('core', 'Event')

    for event in Event.objects.exclude(cover_image=''):
        cover_image = getattr(event, 'cover_image', None)
        if not cover_image or not getattr(cover_image, 'name', ''):
            continue

        try:
            cover_image.open('rb')
            raw_bytes = cover_image.read()
        except Exception:
            continue
        finally:
            try:
                cover_image.close()
            except Exception:
                pass

        if not raw_bytes:
            continue

        event.cover_image_data = base64.b64encode(raw_bytes).decode('ascii')
        event.cover_image_content_type = mimetypes.guess_type(cover_image.name)[0] or 'application/octet-stream'
        event.save(update_fields=['cover_image_data', 'cover_image_content_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_event_cover_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='cover_image_content_type',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='event',
            name='cover_image_data',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(_backfill_event_cover_image_data, migrations.RunPython.noop),
    ]

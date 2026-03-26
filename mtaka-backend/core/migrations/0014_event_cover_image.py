from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_collectionrequestupdate'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='cover_image',
            field=models.ImageField(blank=True, null=True, upload_to='event_covers/'),
        ),
    ]

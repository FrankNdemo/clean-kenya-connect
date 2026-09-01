from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0019_illegaldumping_photo_data'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(blank=True, db_index=True, max_length=254),
        ),
    ]

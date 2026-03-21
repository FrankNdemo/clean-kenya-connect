from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_collectortransaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='collectortransaction',
            name='mpesa_code',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
    ]

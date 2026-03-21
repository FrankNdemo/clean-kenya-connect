from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_collectortransaction_ct_collector_time_idx_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CollectionRequestUpdate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('update_type', models.CharField(choices=[('delay', 'Delay'), ('reschedule', 'Reschedule'), ('declined', 'Declined'), ('message', 'Message'), ('resident_reply', 'Resident Reply')], max_length=20)),
                ('message', models.TextField()),
                ('new_date', models.DateField(blank=True, null=True)),
                ('new_time', models.TimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('collection_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='updates', to='core.collectionrequest')),
                ('sender', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='collection_request_updates', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'collection_request_updates',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='collectionrequestupdate',
            index=models.Index(fields=['collection_request', 'created_at'], name='cru_request_time_idx'),
        ),
    ]

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_mpesapayment'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventScheduleChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('previous_event_date', models.DateField()),
                ('new_event_date', models.DateField()),
                ('previous_start_time', models.TimeField()),
                ('new_start_time', models.TimeField()),
                ('reason', models.TextField()),
                ('changed_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_schedule_changes', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='schedule_changes', to='core.event')),
            ],
            options={
                'db_table': 'event_schedule_changes',
                'ordering': ['-changed_at'],
            },
        ),
        migrations.AddIndex(
            model_name='eventschedulechange',
            index=models.Index(fields=['event', 'changed_at'], name='esc_event_time_idx'),
        ),
    ]

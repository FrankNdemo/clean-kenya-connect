from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_seed_waste_types'),
    ]

    operations = [
        migrations.CreateModel(
            name='CollectorTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('total_weight', models.DecimalField(decimal_places=2, max_digits=10)),
                ('total_price', models.DecimalField(decimal_places=2, max_digits=12)),
                ('payment_method', models.CharField(choices=[('cash', 'Cash'), ('mpesa', 'M-Pesa')], max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('collection_request', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='collector_transaction', to='core.collectionrequest')),
                ('collector', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='core.collector')),
            ],
            options={
                'db_table': 'collector_transactions',
                'ordering': ['-created_at'],
            },
        ),
    ]

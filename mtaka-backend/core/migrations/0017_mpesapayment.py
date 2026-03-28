from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0016_seed_superuser'),
    ]

    operations = [
        migrations.CreateModel(
            name='MpesaPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('payment_scope', models.CharField(choices=[('collector_pickup', 'Collector Pickup'), ('recycler_pickup', 'Recycler Pickup')], max_length=30)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('success', 'Success'), ('failed', 'Failed'), ('cancelled', 'Cancelled')], default='pending', max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('recorded_weight', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('phone_number', models.CharField(max_length=20)),
                ('completion_notes', models.TextField(blank=True, default='')),
                ('merchant_request_id', models.CharField(blank=True, default='', max_length=120)),
                ('checkout_request_id', models.CharField(blank=True, db_index=True, default='', max_length=120)),
                ('response_code', models.CharField(blank=True, default='', max_length=20)),
                ('response_description', models.TextField(blank=True, default='')),
                ('customer_message', models.TextField(blank=True, default='')),
                ('result_code', models.CharField(blank=True, default='', max_length=20)),
                ('result_desc', models.TextField(blank=True, default='')),
                ('mpesa_receipt_number', models.CharField(blank=True, default='', max_length=50)),
                ('raw_request_payload', models.JSONField(blank=True, default=dict)),
                ('raw_response_payload', models.JSONField(blank=True, default=dict)),
                ('raw_callback_payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('collection_request', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='mpesa_payments', to='core.collectionrequest')),
                ('collector_transaction', models.OneToOneField(blank=True, null=True, on_delete=models.SET_NULL, related_name='mpesa_payment', to='core.collectortransaction')),
                ('initiated_by', models.ForeignKey(on_delete=models.CASCADE, related_name='mpesa_payments', to=settings.AUTH_USER_MODEL)),
                ('recyclable_listing', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='mpesa_payments', to='core.recyclablelisting')),
                ('recycler_transaction', models.OneToOneField(blank=True, null=True, on_delete=models.SET_NULL, related_name='mpesa_payment', to='core.recyclertransaction')),
            ],
            options={
                'db_table': 'mpesa_payments',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='mpesapayment',
            index=models.Index(fields=['initiated_by', 'status'], name='mpesa_user_status_idx'),
        ),
        migrations.AddIndex(
            model_name='mpesapayment',
            index=models.Index(fields=['payment_scope', 'status'], name='mpesa_scope_status_idx'),
        ),
    ]

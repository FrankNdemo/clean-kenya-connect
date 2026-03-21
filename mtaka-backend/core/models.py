from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    USER_TYPES = (
        ('household', 'Household'),
        ('collector', 'Collector'),
        ('recycler', 'Recycler'),
        ('authority', 'Authority'),
    )
    user_type = models.CharField(max_length=20, choices=USER_TYPES)
    phone = models.CharField(max_length=20)
    
    class Meta:
        db_table = 'users'

class Household(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='household_profile')
    full_name = models.CharField(max_length=100)
    address = models.TextField(null=True, blank=True)
    estate = models.CharField(max_length=100, null=True)
    green_credits = models.IntegerField(default=0)
    location_lat = models.DecimalField(max_digits=12, decimal_places=8, null=True)
    location_long = models.DecimalField(max_digits=13, decimal_places=8, null=True)
    
    class Meta:
        db_table = 'households'

class Collector(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='collector_profile')
    company_name = models.CharField(max_length=100)
    license_number = models.CharField(max_length=50, null=True)
    vehicle_reg = models.CharField(max_length=50, null=True)
    service_areas = models.TextField(null=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    
    class Meta:
        db_table = 'collectors'

class Recycler(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='recycler_profile')
    company_name = models.CharField(max_length=100)
    business_reg = models.CharField(max_length=50, null=True)
    materials_accepted = models.TextField(null=True)
    price_per_kg = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    location = models.CharField(max_length=255, null=True)
    contact = models.CharField(max_length=100, null=True)
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    
    class Meta:
        db_table = 'recyclers'

class Authority(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='authority_profile')
    staff_name = models.CharField(max_length=100)
    county = models.CharField(max_length=50, null=True)
    department = models.CharField(max_length=100, null=True)
    staff_id = models.CharField(max_length=50, null=True)
    
    class Meta:
        db_table = 'authorities'

class WasteType(models.Model):
    type_name = models.CharField(max_length=50)
    description = models.TextField(null=True)
    is_recyclable = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'waste_types'
    
    def __str__(self):
        return self.type_name

class CollectionRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )
    household = models.ForeignKey(Household, on_delete=models.CASCADE)
    waste_type = models.ForeignKey(WasteType, on_delete=models.CASCADE)
    collector = models.ForeignKey(Collector, on_delete=models.SET_NULL, null=True, blank=True)
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    address = models.TextField()
    address_lat = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)
    address_long = models.DecimalField(max_digits=13, decimal_places=8, null=True, blank=True)
    instructions = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'collection_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['collector', 'status'], name='cr_collector_status_idx'),
            models.Index(fields=['household', 'status'], name='cr_household_status_idx'),
            models.Index(fields=['scheduled_date'], name='cr_scheduled_date_idx'),
            models.Index(fields=['created_at'], name='cr_created_at_idx'),
        ]

class Event(models.Model):
    EVENT_TYPES = (
        ('cleanup', 'Cleanup'),
        ('recycling', 'Recycling'),
        ('awareness', 'Awareness'),
        ('tree-planting', 'Tree Planting'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('ongoing', 'Ongoing'),
        ('completed', 'Completed'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    )
    creator = models.ForeignKey(User, on_delete=models.CASCADE)
    event_name = models.CharField(max_length=200)
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    description = models.TextField()
    location = models.CharField(max_length=255)
    event_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField(null=True)
    max_participants = models.IntegerField(null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reward_points = models.IntegerField(default=30)
    cancellation_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'events'
        ordering = ['event_date']
        indexes = [
            models.Index(fields=['status', 'event_date'], name='ev_status_date_idx'),
            models.Index(fields=['creator', 'status'], name='ev_creator_status_idx'),
        ]

class EventParticipant(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    registration_date = models.DateTimeField(auto_now_add=True)
    attendance_status = models.CharField(max_length=20, default='registered')
    feedback = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'event_participants'
        unique_together = ('event', 'user')
        indexes = [
            models.Index(fields=['user', 'registration_date'], name='ep_user_regdate_idx'),
        ]

class IllegalDumping(models.Model):
    SEVERITY_CHOICES = (
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    )
    STATUS_CHOICES = (
        ('reported', 'Reported'),
        ('investigating', 'Investigating'),
        ('resolved', 'Resolved'),
    )
    reporter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    location = models.CharField(max_length=255)
    location_lat = models.DecimalField(max_digits=10, decimal_places=8, null=True)
    location_long = models.DecimalField(max_digits=11, decimal_places=8, null=True)
    description = models.TextField()
    photo = models.ImageField(upload_to='dumping_reports/', null=True, blank=True)
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='reported')
    is_anonymous = models.BooleanField(default=False)
    reported_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'illegal_dumping'
        ordering = ['-reported_at']
        indexes = [
            models.Index(fields=['status', 'reported_at'], name='dump_status_time_idx'),
            models.Index(fields=['reporter', 'status'], name='dump_reporter_stat_idx'),
        ]

class GreenCredit(models.Model):
    TRANSACTION_TYPES = (
        ('earned', 'Earned'),
        ('redeemed', 'Redeemed'),
    )
    household = models.ForeignKey(Household, on_delete=models.CASCADE)
    transaction_type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    credits_amount = models.IntegerField()
    description = models.CharField(max_length=255)
    reference_id = models.IntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'green_credits'
        ordering = ['-created_at']


class Complaint(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('replied', 'Replied'),
        ('closed', 'Closed'),
    )
    reporter = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.CharField(max_length=200)
    details = models.TextField()
    phone = models.CharField(max_length=50, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reply = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'complaints'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at'], name='compl_status_time_idx'),
            models.Index(fields=['reporter', 'status'], name='compl_reporter_idx'),
        ]


class SuspendedUser(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    reason = models.TextField(null=True, blank=True)
    suspended_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = 'suspended_users'
        ordering = ['-suspended_at']
        indexes = [
            models.Index(fields=['user', 'active'], name='susp_user_active_idx'),
        ]


class RecyclableListing(models.Model):
    MATERIAL_TYPES = (
        ('plastic', 'Plastic'),
        ('paper', 'Paper'),
        ('metal', 'Metal'),
        ('glass', 'Glass'),
        ('electronics', 'Electronics'),
    )
    STATUS_CHOICES = (
        ('available', 'Available'),
        ('offer_pending', 'Offer Pending'),
        ('offer_accepted', 'Offer Accepted'),
        ('scheduled', 'Scheduled'),
        ('collected', 'Collected'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )

    resident = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recyclable_listings')
    resident_name = models.CharField(max_length=120)
    resident_phone = models.CharField(max_length=30, blank=True, default='')
    resident_location = models.CharField(max_length=255, blank=True, default='')
    resident_location_lat = models.DecimalField(max_digits=12, decimal_places=8, null=True, blank=True)
    resident_location_long = models.DecimalField(max_digits=13, decimal_places=8, null=True, blank=True)
    material_type = models.CharField(max_length=20, choices=MATERIAL_TYPES)
    estimated_weight = models.DecimalField(max_digits=10, decimal_places=2)
    actual_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.TextField()
    preferred_date = models.DateField()
    preferred_time = models.TimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    recycler = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_recyclable_listings')
    recycler_name = models.CharField(max_length=120, blank=True, default='')
    scheduled_date = models.DateField(null=True, blank=True)
    scheduled_time = models.TimeField(null=True, blank=True)
    offered_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    accepted_offer = models.ForeignKey('PriceOffer', on_delete=models.SET_NULL, null=True, blank=True, related_name='accepted_for_listings')
    completion_notes = models.TextField(blank=True, default='')
    cancel_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'recyclable_listings'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at'], name='rl_status_created_idx'),
            models.Index(fields=['recycler', 'status'], name='rl_recycler_stat_idx'),
            models.Index(fields=['resident', 'status'], name='rl_resident_stat_idx'),
        ]


class PriceOffer(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
    )

    listing = models.ForeignKey(RecyclableListing, on_delete=models.CASCADE, related_name='offers')
    recycler = models.ForeignKey(User, on_delete=models.CASCADE, related_name='price_offers')
    recycler_name = models.CharField(max_length=120)
    recycler_phone = models.CharField(max_length=30, blank=True, default='')
    offered_price_per_kg = models.DecimalField(max_digits=12, decimal_places=2)
    offered_price = models.DecimalField(max_digits=12, decimal_places=2)
    message = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    reject_reason = models.TextField(blank=True, default='')
    is_re_offer = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'price_offers'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['listing', 'status'], name='po_listing_stat_idx'),
            models.Index(fields=['recycler', 'status'], name='po_recycler_stat_idx'),
        ]


class RecyclerTransaction(models.Model):
    MATERIAL_TYPES = RecyclableListing.MATERIAL_TYPES
    PAYMENT_METHODS = (
        ('cash', 'Cash'),
        ('mpesa', 'Mpesa'),
    )

    listing = models.ForeignKey(RecyclableListing, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    recycler = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recycler_transactions')
    material_type = models.CharField(max_length=20, choices=MATERIAL_TYPES)
    weight = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    source = models.CharField(max_length=255)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHODS)
    mpesa_code = models.CharField(max_length=50, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'recycler_transactions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recycler', 'created_at'], name='rt_recycler_time_idx'),
            models.Index(fields=['material_type', 'created_at'], name='rt_material_time_idx'),
        ]


class CollectorTransaction(models.Model):
    PAYMENT_METHODS = (
        ('cash', 'Cash'),
        ('mpesa', 'M-Pesa'),
    )

    collection_request = models.OneToOneField(
        CollectionRequest,
        on_delete=models.CASCADE,
        related_name='collector_transaction',
    )
    collector = models.ForeignKey(
        Collector,
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    total_weight = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHODS)
    mpesa_code = models.CharField(max_length=50, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'collector_transactions'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['collector', 'created_at'], name='ct_collector_time_idx'),
        ]

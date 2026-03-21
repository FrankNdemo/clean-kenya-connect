from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import *
from django.utils.text import slugify

class UserSerializer(serializers.ModelSerializer):
    reward_points = serializers.SerializerMethodField()
    company_name = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'user_type',
            'phone',
            'first_name',
            'last_name',
            'reward_points',
            'company_name',
            'location',
        ]
        read_only_fields = ['id']

    @staticmethod
    def _get_cached_related(obj, relation_name):
        field = obj._meta.get_field(relation_name)
        if field.is_cached(obj):
            return getattr(obj, relation_name, None)
        return None

    def get_reward_points(self, obj):
        if obj.user_type != 'household':
            return 0
        profile = self._get_cached_related(obj, 'household_profile')
        if profile is not None:
            return profile.green_credits
        household = Household.objects.filter(user=obj).only('green_credits').first()
        return household.green_credits if household else 0

    def get_company_name(self, obj):
        if obj.user_type == 'collector':
            profile = self._get_cached_related(obj, 'collector_profile')
            if profile is not None:
                return profile.company_name
            collector = Collector.objects.filter(user=obj).only('company_name').first()
            return collector.company_name if collector else ''
        if obj.user_type == 'recycler':
            profile = self._get_cached_related(obj, 'recycler_profile')
            if profile is not None:
                return profile.company_name
            recycler = Recycler.objects.filter(user=obj).only('company_name').first()
            return recycler.company_name if recycler else ''
        return ''

    def get_location(self, obj):
        if obj.user_type == 'household':
            profile = self._get_cached_related(obj, 'household_profile')
            if profile is not None:
                return profile.address or ''
            household = Household.objects.filter(user=obj).only('address').first()
            return household.address if household and household.address else ''
        if obj.user_type == 'collector':
            profile = self._get_cached_related(obj, 'collector_profile')
            if profile is not None:
                return profile.service_areas or ''
            collector = Collector.objects.filter(user=obj).only('service_areas').first()
            return collector.service_areas if collector and collector.service_areas else ''
        if obj.user_type == 'recycler':
            profile = self._get_cached_related(obj, 'recycler_profile')
            if profile is not None:
                return profile.location or ''
            recycler = Recycler.objects.filter(user=obj).only('location').first()
            return recycler.location if recycler and recycler.location else ''
        if obj.user_type == 'authority':
            profile = self._get_cached_related(obj, 'authority_profile')
            if profile is not None:
                return profile.county or ''
            authority = Authority.objects.filter(user=obj).only('county').first()
            return authority.county if authority and authority.county else ''
        return ''

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)
    full_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    company_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    license_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    county_of_operation = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'user_type', 'phone',
                  'full_name', 'company_name', 'license_number', 'county_of_operation', 'first_name', 'last_name']
    
    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({"password": "Passwords don't match"})

        user_type = attrs.get('user_type')
        company_name = (attrs.get('company_name') or '').strip()
        license_number = (attrs.get('license_number') or '').strip()
        county_of_operation = (attrs.get('county_of_operation') or '').strip()

        if user_type in ['collector', 'recycler']:
            errors = {}
            if not company_name:
                errors['company_name'] = 'This field is required for collectors and recyclers.'
            if not license_number:
                errors['license_number'] = 'This field is required for collectors and recyclers.'
            if errors:
                raise serializers.ValidationError(errors)
            attrs['company_name'] = company_name
            attrs['license_number'] = license_number

        if user_type == 'authority':
            if not county_of_operation:
                raise serializers.ValidationError({
                    'county_of_operation': 'This field is required for authority users.'
                })
            attrs['county_of_operation'] = county_of_operation

        username = attrs.get('username', '') or ''
        full_name = attrs.get('full_name', '') or ''
        email = attrs.get('email', '') or ''

        if username:
            import re
            normalized = re.sub(r"[^A-Za-z0-9@.+\-_/]", "", username.replace(' ', '_'))
            if not normalized:
                username = ''
            else:
                username = normalized

        if not username:
            if full_name:
                username = ''.join(c for c in full_name if c.isalnum()).lower() or full_name.replace(' ', '_')
            elif email:
                username = email.split('@')[0]
            else:
                username = f'user_{int(__import__("time").time())}'

        attrs['username'] = username

        return attrs

    def validate_username(self, value):
        import re
        normalized = re.sub(r"[^A-Za-z0-9@.+\\-_/]", "", value.replace(' ', '_'))
        if normalized:
            return normalized

        full_name = self.initial_data.get('full_name') or ''
        email = self.initial_data.get('email') or ''
        if full_name:
            derived = ''.join(c for c in full_name if c.isalnum()).lower() or full_name.replace(' ', '_')
            return derived
        if email:
            return email.split('@')[0]

        return f'user_{int(__import__("time").time())}'

    def validate_email(self, value):
        normalized = (value or '').strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return normalized
    
    def create(self, validated_data):
        validated_data.pop('password2')
        full_name = validated_data.pop('full_name', '')
        company_name = validated_data.pop('company_name', '')
        license_number = validated_data.pop('license_number', '')
        county_of_operation = validated_data.pop('county_of_operation', '')
        username_val = ''
        if full_name:
            base = ''.join(c for c in full_name if c.isalnum()).lower() or slugify(full_name)
            username_val = base
            counter = 1
            while User.objects.filter(username=username_val).exists():
                username_val = f"{base}{counter}"
                counter += 1
        else:
            username_val = validated_data.get('username') or validated_data.get('email')

        first_name = ''
        last_name = ''
        if full_name:
            parts = full_name.strip().split()
            if len(parts) == 1:
                first_name = parts[0]
            else:
                first_name = parts[0]
                last_name = ' '.join(parts[1:])

        user = User.objects.create_user(
            username=username_val,
            email=validated_data.get('email', ''),
            user_type=validated_data.get('user_type', ''),
            phone=validated_data.get('phone', ''),
            first_name=first_name or validated_data.get('first_name', ''),
            last_name=last_name or validated_data.get('last_name', '')
        )
        user.set_password(validated_data['password'])
        user.save()
        
        if user.user_type == 'household':
            Household.objects.create(user=user, full_name=full_name or user.username)
        elif user.user_type == 'collector':
            Collector.objects.create(
                user=user,
                company_name=company_name or user.username,
                license_number=license_number
            )
        elif user.user_type == 'recycler':
            Recycler.objects.create(
                user=user,
                company_name=company_name or user.username,
                business_reg=license_number
            )
        elif user.user_type == 'authority':
            Authority.objects.create(
                user=user,
                staff_name=full_name or user.username,
                county=county_of_operation or None
            )
        
        return user

class HouseholdSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Household
        fields = '__all__'

class CollectorSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Collector
        fields = '__all__'

class RecyclerSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Recycler
        fields = '__all__'

class AuthoritySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Authority
        fields = '__all__'

class WasteTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WasteType
        fields = '__all__'

class FlexibleCollectorField(serializers.PrimaryKeyRelatedField):
    """
    Accepts either:
    - collectors.id (default PK behavior), or
    - users.id for a collector user (mapped to Collector via user_id).
    """
    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None

        try:
            collector_value = int(data)
        except (TypeError, ValueError):
            return super().to_internal_value(data)

        collector_by_user = Collector.objects.filter(user_id=collector_value).first()
        if collector_by_user:
            return collector_by_user

        return super().to_internal_value(data)

class CollectionRequestSerializer(serializers.ModelSerializer):
    household_name = serializers.CharField(source='household.full_name', read_only=True)
    household_phone = serializers.CharField(source='household.user.phone', read_only=True)
    waste_type_name = serializers.CharField(source='waste_type.type_name', read_only=True)
    collector_name = serializers.CharField(source='collector.company_name', read_only=True)
    collector_user_id = serializers.IntegerField(source='collector.user.id', read_only=True)
    collector = FlexibleCollectorField(queryset=Collector.objects.all(), required=False, allow_null=True)
    
    class Meta:
        model = CollectionRequest
        fields = '__all__'
        extra_kwargs = {
            'household': {'read_only': True},
            'collector': {'required': False, 'allow_null': True},
            'instructions': {'required': False, 'allow_blank': True},
            'status': {'required': False},
        }

class EventSerializer(serializers.ModelSerializer):
    creator_name = serializers.CharField(source='creator.username', read_only=True)
    participant_count = serializers.SerializerMethodField()
    participants = serializers.SerializerMethodField()
    organizerId = serializers.IntegerField(source='creator.id', read_only=True)
    organizerName = serializers.CharField(source='creator.username', read_only=True)
    title = serializers.CharField(source='event_name')
    type = serializers.CharField(source='event_type')
    date = serializers.DateField(source='event_date')
    time = serializers.TimeField(source='start_time', format='%H:%M')
    maxParticipants = serializers.IntegerField(source='max_participants')
    rewardPoints = serializers.IntegerField(source='reward_points')
    cancellationReason = serializers.CharField(source='cancellation_reason', read_only=True)
    
    class Meta:
        model = Event
        fields = [
            'id',
            'creator',
            'creator_name',
            'organizerId',
            'organizerName',
            'event_name',
            'event_type',
            'event_date',
            'start_time',
            'end_time',
            'max_participants',
            'reward_points',
            'cancellation_reason',
            'status',
            'description',
            'location',
            'created_at',
            'participant_count',
            'participants',
            'title',
            'type',
            'date',
            'time',
            'maxParticipants',
            'rewardPoints',
            'cancellationReason',
        ]
        read_only_fields = ['creator', 'cancellation_reason']
        extra_kwargs = {
            'event_name': {'required': False},
            'event_type': {'required': False},
            'event_date': {'required': False},
            'start_time': {'required': False},
            'end_time': {'required': False, 'allow_null': True},
            'max_participants': {'required': False, 'allow_null': True},
            'reward_points': {'required': False},
            'status': {'required': False},
        }
    
    def get_participant_count(self, obj):
        annotated_count = getattr(obj, 'participant_count_cached', None)
        if annotated_count is not None:
            return annotated_count
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('participants')
        if prefetched is not None:
            return len(prefetched)
        return obj.participants.count()

    def get_participants(self, obj):
        prefetched = getattr(obj, '_prefetched_objects_cache', {}).get('participants')
        if prefetched is not None:
            return [participant.user_id for participant in prefetched]
        return list(obj.participants.values_list('user_id', flat=True))

class EventParticipantSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_phone = serializers.CharField(source='user.phone', read_only=True)
    event_name = serializers.CharField(source='event.event_name', read_only=True)
    
    class Meta:
        model = EventParticipant
        fields = '__all__'

class IllegalDumpingSerializer(serializers.ModelSerializer):
    reporter_name = serializers.CharField(source='reporter.username', read_only=True)
    reporter_phone = serializers.CharField(source='reporter.phone', read_only=True)
    
    class Meta:
        model = IllegalDumping
        fields = '__all__'

class GreenCreditSerializer(serializers.ModelSerializer):
    household_name = serializers.CharField(source='household.full_name', read_only=True)
    
    class Meta:
        model = GreenCredit
        fields = '__all__'


class ComplaintSerializer(serializers.ModelSerializer):
    reporter_name = serializers.CharField(source='reporter.username', read_only=True)
    reporter_email = serializers.CharField(source='reporter.email', read_only=True)
    reporter_phone = serializers.CharField(source='reporter.phone', read_only=True)

    class Meta:
        model = Complaint
        fields = '__all__'


class SuspendedUserSerializer(serializers.ModelSerializer):
    user_info = UserSerializer(source='user', read_only=True)

    class Meta:
        model = SuspendedUser
        fields = '__all__'


class RecyclableListingSerializer(serializers.ModelSerializer):
    resident_id = serializers.IntegerField(source='resident.id', read_only=True)
    recycler_id = serializers.IntegerField(source='recycler.id', read_only=True)
    accepted_offer_id = serializers.IntegerField(source='accepted_offer.id', read_only=True)
    materialType = serializers.CharField(source='material_type', read_only=True)
    estimatedWeight = serializers.DecimalField(source='estimated_weight', max_digits=10, decimal_places=2, read_only=True)
    actualWeight = serializers.DecimalField(source='actual_weight', max_digits=10, decimal_places=2, read_only=True)
    preferredDate = serializers.DateField(source='preferred_date', read_only=True)
    preferredTime = serializers.TimeField(source='preferred_time', format='%H:%M', read_only=True)
    residentId = serializers.IntegerField(source='resident.id', read_only=True)
    residentName = serializers.CharField(source='resident_name', read_only=True)
    residentPhone = serializers.CharField(source='resident_phone', read_only=True)
    residentLocation = serializers.CharField(source='resident_location', read_only=True)
    residentLocationLat = serializers.DecimalField(source='resident_location_lat', max_digits=12, decimal_places=8, read_only=True)
    residentLocationLong = serializers.DecimalField(source='resident_location_long', max_digits=13, decimal_places=8, read_only=True)
    recyclerId = serializers.IntegerField(source='recycler.id', read_only=True)
    recyclerName = serializers.CharField(source='recycler_name', read_only=True)
    scheduledDate = serializers.DateField(source='scheduled_date', read_only=True)
    scheduledTime = serializers.TimeField(source='scheduled_time', format='%H:%M', read_only=True)
    offeredPrice = serializers.DecimalField(source='offered_price', max_digits=12, decimal_places=2, read_only=True)
    acceptedOfferId = serializers.IntegerField(source='accepted_offer.id', read_only=True)
    completionNotes = serializers.CharField(source='completion_notes', read_only=True)
    cancelReason = serializers.CharField(source='cancel_reason', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = RecyclableListing
        fields = '__all__'
        extra_kwargs = {
            'resident': {'read_only': True},
            'resident_name': {'required': False},
            'resident_phone': {'required': False},
            'resident_location': {'required': False},
            'resident_location_lat': {'required': False, 'allow_null': True},
            'resident_location_long': {'required': False, 'allow_null': True},
            'recycler': {'required': False, 'allow_null': True},
            'recycler_name': {'required': False},
            'scheduled_date': {'required': False, 'allow_null': True},
            'scheduled_time': {'required': False, 'allow_null': True},
            'offered_price': {'required': False, 'allow_null': True},
            'accepted_offer': {'required': False, 'allow_null': True},
            'actual_weight': {'required': False, 'allow_null': True},
            'completion_notes': {'required': False, 'allow_blank': True},
            'cancel_reason': {'required': False, 'allow_blank': True},
        }


class PriceOfferSerializer(serializers.ModelSerializer):
    listing_id = serializers.IntegerField(source='listing.id', read_only=True)
    recycler_id = serializers.IntegerField(source='recycler.id', read_only=True)
    listingId = serializers.IntegerField(source='listing.id', read_only=True)
    recyclerId = serializers.IntegerField(source='recycler.id', read_only=True)
    recyclerName = serializers.CharField(source='recycler_name', read_only=True)
    recyclerPhone = serializers.CharField(source='recycler_phone', read_only=True)
    offeredPricePerKg = serializers.DecimalField(source='offered_price_per_kg', max_digits=12, decimal_places=2, read_only=True)
    offeredPrice = serializers.DecimalField(source='offered_price', max_digits=12, decimal_places=2, read_only=True)
    rejectReason = serializers.CharField(source='reject_reason', read_only=True)
    isReOffer = serializers.BooleanField(source='is_re_offer', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = PriceOffer
        fields = '__all__'
        extra_kwargs = {
            'recycler': {'read_only': True},
            'recycler_name': {'required': False},
            'recycler_phone': {'required': False},
            'status': {'required': False},
            'reject_reason': {'required': False, 'allow_blank': True},
            'is_re_offer': {'required': False},
        }


class RecyclerTransactionSerializer(serializers.ModelSerializer):
    recyclerId = serializers.IntegerField(source='recycler.id', read_only=True)
    materialType = serializers.CharField(source='material_type', read_only=True)
    paymentMethod = serializers.CharField(source='payment_method', read_only=True)
    mpesaCode = serializers.CharField(source='mpesa_code', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = RecyclerTransaction
        fields = '__all__'
        extra_kwargs = {
            'recycler': {'read_only': True},
            'listing': {'required': False, 'allow_null': True},
            'mpesa_code': {'required': False, 'allow_blank': True},
        }


class CollectorTransactionSerializer(serializers.ModelSerializer):
    collector_name = serializers.CharField(source='collector.company_name', read_only=True)
    resident_name = serializers.CharField(source='collection_request.household.full_name', read_only=True)
    resident_id = serializers.IntegerField(source='collection_request.household.user.id', read_only=True)
    location = serializers.CharField(source='collection_request.address', read_only=True)
    collection_request_date = serializers.DateField(source='collection_request.scheduled_date', read_only=True)
    collection_request_time = serializers.TimeField(source='collection_request.scheduled_time', format='%H:%M', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    totalWeight = serializers.DecimalField(source='total_weight', max_digits=10, decimal_places=2, read_only=True)
    totalPrice = serializers.DecimalField(source='total_price', max_digits=12, decimal_places=2, read_only=True)
    paymentMethod = serializers.CharField(source='payment_method', read_only=True)
    mpesaCode = serializers.CharField(source='mpesa_code', read_only=True)

    class Meta:
        model = CollectorTransaction
        fields = '__all__'
        extra_kwargs = {
            'collector': {'read_only': True},
        }

    def validate(self, attrs):
        request = attrs.get('collection_request')
        if not request:
            raise serializers.ValidationError({'collection_request': 'This field is required.'})

        if request.status == 'cancelled':
            raise serializers.ValidationError({'collection_request': 'Cannot create a transaction for a cancelled pickup.'})

        collector = self.context['request'].user.collector_profile
        if request.collector_id != collector.id:
            raise serializers.ValidationError({'collection_request': 'This pickup is not assigned to you.'})

        payment_method = attrs.get('payment_method')
        mpesa_code = (attrs.get('mpesa_code') or '').strip()
        if payment_method == 'mpesa' and not mpesa_code:
            raise serializers.ValidationError({'mpesa_code': 'M-Pesa transaction code is required.'})

        return attrs

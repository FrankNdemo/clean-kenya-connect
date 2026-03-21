from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.db.models import Q
from django.db.models import Count, Prefetch
from django.db import transaction
from django.utils import timezone
from django.core.cache import cache
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import logging
import json
from .models import *
from .serializers import *

logger = logging.getLogger(__name__)


def _get_profile_data_for_user(user):
    if user.user_type == 'household':
        profile, _ = Household.objects.get_or_create(
            user=user,
            defaults={'full_name': user.get_full_name() or user.username},
        )
        return HouseholdSerializer(profile).data
    if user.user_type == 'collector':
        profile, _ = Collector.objects.get_or_create(
            user=user,
            defaults={'company_name': user.username},
        )
        return CollectorSerializer(profile).data
    if user.user_type == 'recycler':
        profile, _ = Recycler.objects.get_or_create(
            user=user,
            defaults={'company_name': user.username},
        )
        return RecyclerSerializer(profile).data
    if user.user_type == 'authority':
        profile, _ = Authority.objects.get_or_create(
            user=user,
            defaults={'staff_name': user.get_full_name() or user.username},
        )
        return AuthoritySerializer(profile).data
    return {}


def _build_auth_response(user, refresh, access, status_code=200):
    resp = JsonResponse({
        'user': UserSerializer(user).data,
        'profile': _get_profile_data_for_user(user),
        'access': str(access),
        'refresh': str(refresh),
    }, status=status_code)

    refresh_max_age = getattr(settings, 'SIMPLE_JWT', {}).get('REFRESH_TOKEN_LIFETIME', None)
    if isinstance(refresh_max_age, timedelta):
        refresh_max_age = int(refresh_max_age.total_seconds())
    else:
        refresh_max_age = 60 * 60 * 24 * 7

    access_max_age = getattr(settings, 'SIMPLE_JWT', {}).get('ACCESS_TOKEN_LIFETIME', None)
    if isinstance(access_max_age, timedelta):
        access_max_age = int(access_max_age.total_seconds())
    else:
        access_max_age = 60 * 5

    resp.set_cookie(
        'refresh_token',
        str(refresh),
        httponly=True,
        secure=getattr(settings, 'JWT_COOKIE_SECURE', False),
        samesite=getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax'),
        domain=getattr(settings, 'JWT_COOKIE_DOMAIN', None),
        max_age=refresh_max_age,
    )
    resp.set_cookie(
        'access_token',
        str(access),
        httponly=True,
        secure=getattr(settings, 'JWT_COOKIE_SECURE', False),
        samesite=getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax'),
        domain=getattr(settings, 'JWT_COOKIE_DOMAIN', None),
        max_age=access_max_age,
    )
    return resp


def award_household_credits(user, points, description, reference_id=None):
    if not user or user.user_type != 'household' or points <= 0:
        return
    household = Household.objects.filter(user=user).first()
    if not household:
        return
    GreenCredit.objects.create(
        household=household,
        transaction_type='earned',
        credits_amount=points,
        description=description,
        reference_id=reference_id,
    )
    household.green_credits += points
    household.save(update_fields=['green_credits'])


# Authentication Views - Plain Django views (not @api_view) with @csrf_exempt
@csrf_exempt
def register_user(request):
    """Register a new user without CSRF validation."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        data = json.loads(request.body)
    except:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[REGISTER DEBUG] Registration request received.")
    
    serializer = RegisterSerializer(data=data)
    if serializer.is_valid():
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        refresh['sid'] = getattr(settings, 'RUNTIME_SESSION_ID', '')
        access = refresh.access_token

        resp = _build_auth_response(user, refresh, access, status_code=201)
        cache.delete("api:list_users:v1")

        return resp
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[REGISTER DEBUG] Validation failed: %s", serializer.errors)
    return JsonResponse(serializer.errors, status=400)

@csrf_exempt
def login_user(request):
    """Authenticate user without CSRF validation."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    
    try:
        data = json.loads(request.body)
    except:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    
    username_or_email = data.get('username')
    password = data.get('password')
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[LOGIN DEBUG] Login attempt received.")
    
    # Avoid double password-hash checks (slow) by resolving identifier once.
    identifier = (username_or_email or '').strip()
    user = None
    if identifier:
        if '@' in identifier:
            # Email may not be unique in legacy data; pick the account whose password matches.
            candidates = User.objects.filter(email__iexact=identifier, is_active=True).order_by('-id')
            for candidate in candidates:
                if candidate.check_password(password):
                    user = candidate
                    break
        else:
            # Username login remains compatible with default auth backend.
            user = authenticate(username=identifier, password=password)
    
    if user:
        active_suspend = SuspendedUser.objects.filter(user=user, active=True).order_by('-suspended_at').first()
        if active_suspend:
            reason = (active_suspend.reason or '').strip()
            message = 'Your account is currently suspended by county authority.'
            if reason:
                message = f'{message} Reason: {reason}'
            return JsonResponse(
                {
                    'error': message,
                    'suspended': True,
                    'suspension_reason': reason,
                    'suspended_user': {
                        'id': user.id,
                        'email': user.email,
                        'phone': user.phone,
                        'name': user.get_full_name() or user.username,
                    },
                },
                status=403,
            )

        refresh = RefreshToken.for_user(user)
        refresh['sid'] = getattr(settings, 'RUNTIME_SESSION_ID', '')
        access = refresh.access_token

        if getattr(settings, 'DEBUG', False):
            logger.debug(
                "[LOGIN DEBUG] Login successful for user_id=%s user_type=%s",
                user.id,
                user.user_type,
            )

        return _build_auth_response(user, refresh, access)
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[LOGIN DEBUG] Authentication failed.")
    return JsonResponse({'error': 'Invalid credentials'}, status=401)


@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token_cookie(request):
    # Read refresh token from cookie and issue a new access token
    refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
    if not refresh_token:
        return Response({'detail': 'Refresh token missing'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        refresh = RefreshToken(refresh_token)
        current_session_id = getattr(settings, 'RUNTIME_SESSION_ID', None)
        if current_session_id and refresh.get('sid') != current_session_id:
            raise ValueError('Stale server session token')
        new_access = refresh.access_token

        resp = Response({'access': str(new_access), 'refresh': str(refresh)})

        access_max_age = getattr(settings, 'SIMPLE_JWT', {}).get('ACCESS_TOKEN_LIFETIME', None)
        if isinstance(access_max_age, timedelta):
            access_max_age = int(access_max_age.total_seconds())
        else:
            access_max_age = 60 * 5

        resp.set_cookie(
            'access_token',
            str(new_access),
            httponly=True,
            secure=getattr(settings, 'JWT_COOKIE_SECURE', False),
            samesite=getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax'),
            domain=getattr(settings, 'JWT_COOKIE_DOMAIN', None),
            max_age=access_max_age,
        )
        return resp
    except Exception:
        return Response({'detail': 'Invalid refresh token'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_user(request):
    # Clear auth cookies
    resp = Response({'detail': 'Logged out'}, status=status.HTTP_200_OK)
    resp.delete_cookie('access_token')
    resp.delete_cookie('refresh_token')
    return resp

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def get_user_profile(request):
    user = request.user

    if request.method == 'PATCH':
        payload = request.data
        update_fields = []

        full_name = str(payload.get('name', '')).strip()
        if full_name:
            parts = full_name.split()
            user.first_name = parts[0]
            user.last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
            update_fields.extend(['first_name', 'last_name'])

        email = payload.get('email')
        if email is not None:
            user.email = str(email).strip()
            update_fields.append('email')

        phone = payload.get('phone')
        if phone is not None:
            user.phone = str(phone).strip()
            update_fields.append('phone')

        if update_fields:
            user.save(update_fields=list(set(update_fields)))
            cache.delete("api:list_users:v1")

        location = payload.get('location')
        if location is not None:
            location_value = str(location).strip()
            if user.user_type == 'household':
                household, _ = Household.objects.get_or_create(user=user, defaults={'full_name': user.get_full_name() or user.username})
                household.address = location_value
                household.save(update_fields=['address'])
            elif user.user_type == 'collector':
                collector, _ = Collector.objects.get_or_create(user=user, defaults={'company_name': user.username})
                collector.service_areas = location_value
                collector.save(update_fields=['service_areas'])
            elif user.user_type == 'recycler':
                recycler, _ = Recycler.objects.get_or_create(user=user, defaults={'company_name': user.username})
                recycler.location = location_value
                recycler.save(update_fields=['location'])
            elif user.user_type == 'authority':
                authority, _ = Authority.objects.get_or_create(user=user, defaults={'staff_name': user.get_full_name() or user.username})
                authority.county = location_value
                authority.save(update_fields=['county'])

    return Response({
        'user': UserSerializer(user).data,
        'profile': _get_profile_data_for_user(user)
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def list_users(request):
    cache_key = "api:list_users:v1"
    cached_payload = cache.get(cache_key)
    if cached_payload is not None:
        return Response(cached_payload)

    users = User.objects.select_related(
        'household_profile',
        'collector_profile',
        'recycler_profile',
        'authority_profile',
    ).all()
    serializer = UserSerializer(users, many=True)
    payload = serializer.data
    cache.set(cache_key, payload, timeout=30)
    return Response(payload)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    from django.middleware.csrf import get_token
    token = get_token(request)
    resp = Response({'csrfToken': token})
    # Also set the csrftoken cookie so Django's CSRF middleware can validate double-submit
    resp.set_cookie(
        'csrftoken',
        token,
        httponly=False,
        secure=getattr(settings, 'CSRF_COOKIE_SECURE', False),
        samesite='Lax',
    )
    return resp

# ViewSets
class WasteTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WasteType.objects.all()
    serializer_class = WasteTypeSerializer
    permission_classes = [AllowAny]

class CollectionRequestViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionRequestSerializer
    permission_classes = [IsAuthenticated]

    def _resolve_collector_from_request(self):
        collector_raw = self.request.data.get('collector')
        if collector_raw in (None, '', 'null'):
            return None

        try:
            collector_value = int(collector_raw)
        except (TypeError, ValueError):
            return None

        # Frontend sends users.id for selected collector; prefer user_id mapping.
        collector_by_user = Collector.objects.filter(user_id=collector_value).first()
        if collector_by_user:
            return collector_by_user

        # Fallback for clients sending collectors.id.
        return Collector.objects.filter(id=collector_value).first()
    
    def get_queryset(self):
        user = self.request.user
        base_queryset = CollectionRequest.objects.select_related(
            'household',
            'household__user',
            'waste_type',
            'collector',
            'collector__user',
        )
        if user.user_type == 'household':
            household = Household.objects.get(user=user)
            return base_queryset.filter(household=household)
        elif user.user_type == 'collector':
            collector = Collector.objects.get(user=user)
            return base_queryset.filter(collector=collector)
        return base_queryset
    
    def perform_create(self, serializer):
        household = Household.objects.get(user=self.request.user)
        collector = self._resolve_collector_from_request()
        collection = serializer.save(household=household, collector=collector)

        # Keep household profile coordinates in sync with the latest scheduled pickup.
        lat = collection.address_lat
        lng = collection.address_long
        updated_fields = []
        if lat is not None:
            household.location_lat = lat
            updated_fields.append('location_lat')
        if lng is not None:
            household.location_long = lng
            updated_fields.append('location_long')
        if collection.address:
            household.address = collection.address
            updated_fields.append('address')
        if updated_fields:
            household.save(update_fields=list(set(updated_fields)))

        award_household_credits(
            user=self.request.user,
            points=10,
            description='Scheduled waste collection',
            reference_id=collection.id,
        )

    def perform_update(self, serializer):
        collector = self._resolve_collector_from_request()
        if 'collector' in self.request.data:
            serializer.save(collector=collector)
            return
        serializer.save()

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all().select_related('creator').prefetch_related(
        Prefetch('participants', queryset=EventParticipant.objects.only('id', 'event_id', 'user_id'))
    ).annotate(participant_count_cached=Count('participants', distinct=True))
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    
    def _expire_past_events(self):
        # Run at most once per minute to avoid expensive update scans on every request.
        cache_key = 'events:expiry:last_run'
        if cache.get(cache_key):
            return
        today = timezone.localdate()
        Event.objects.filter(
            event_date__lt=today,
            status__in=['pending', 'approved', 'ongoing']
        ).update(status='expired')
        cache.set(cache_key, True, timeout=60)

    def get_queryset(self):
        self._expire_past_events()
        return Event.objects.all().select_related('creator').prefetch_related(
            Prefetch('participants', queryset=EventParticipant.objects.only('id', 'event_id', 'user_id'))
        ).annotate(participant_count_cached=Count('participants', distinct=True))

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        event = serializer.save(creator=self.request.user)
        # Creator is auto-registered as a participant for parity with frontend behavior
        EventParticipant.objects.get_or_create(event=event, user=self.request.user)
    
    @action(detail=True, methods=['post'])
    def register(self, request, pk=None):
        self._expire_past_events()
        event = self.get_object()
        user = request.user

        today = timezone.localdate()
        if event.event_date == today:
            return Response(
                {'error': 'Joining is closed on the event day (D-Day)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if event.event_date < today or event.status == 'expired':
            return Response({'error': 'This event has expired'}, status=status.HTTP_400_BAD_REQUEST)
        if event.status != 'approved':
            return Response({'error': 'Only approved events can be joined'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if already registered
        if EventParticipant.objects.filter(event=event, user=user).exists():
            return Response({'error': 'Already registered'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check capacity
        if event.max_participants:
            current_count = event.participants.count()
            if current_count >= event.max_participants:
                return Response({'error': 'Event is full'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Register user
        participant = EventParticipant.objects.create(event=event, user=user)
        
        # Award configured event points for household users
        award_household_credits(
            user=user,
            points=event.reward_points,
            description=f'Registered for event: {event.event_name}',
            reference_id=event.id,
        )
        
        return Response(EventParticipantSerializer(participant).data)

    @action(detail=True, methods=['post'])
    def unregister(self, request, pk=None):
        event = self.get_object()
        user = request.user

        # Organizer cannot unregister themselves; they should cancel the event instead.
        if event.creator_id == user.id:
            return Response(
                {'error': 'Event organizer cannot leave their own event'},
                status=status.HTTP_400_BAD_REQUEST
            )

        deleted, _ = EventParticipant.objects.filter(event=event, user=user).delete()
        if deleted == 0:
            return Response({'error': 'Not registered for this event'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Unregistered successfully'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        event = self.get_object()
        user = request.user

        if event.creator_id != user.id:
            raise PermissionDenied('Only event organizer can cancel this event')

        event.status = 'cancelled'
        event.cancellation_reason = request.data.get('reason', '')
        event.save(update_fields=['status', 'cancellation_reason'])

        return Response(EventSerializer(event).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        event = self.get_object()
        if request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can approve events')
        event.status = 'approved'
        event.save(update_fields=['status'])
        return Response(EventSerializer(event).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        event = self.get_object()
        if request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can reject events')
        event.status = 'rejected'
        event.save(update_fields=['status'])
        return Response(EventSerializer(event).data)

    @action(detail=False, methods=['get'])
    def my_events(self, request):
        self._expire_past_events()
        user = request.user
        queryset = Event.objects.filter(
            Q(creator=user) | Q(participants__user=user)
        ).distinct().select_related('creator').prefetch_related(
            Prefetch('participants', queryset=EventParticipant.objects.only('id', 'event_id', 'user_id'))
        ).annotate(participant_count_cached=Count('participants', distinct=True))
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_expired_created(self, request):
        self._expire_past_events()
        user = request.user
        queryset = Event.objects.filter(
            creator=user,
            status='expired'
        ).select_related('creator').prefetch_related(
            Prefetch('participants', queryset=EventParticipant.objects.only('id', 'event_id', 'user_id'))
        ).annotate(participant_count_cached=Count('participants', distinct=True)).order_by('-event_date')
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def participants_list(self, request, pk=None):
        self._expire_past_events()
        event = self.get_object()
        participants = EventParticipant.objects.filter(event=event).select_related('user')
        serializer = EventParticipantSerializer(participants, many=True)
        return Response(serializer.data)

class RecyclerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Recycler.objects.all()
    serializer_class = RecyclerSerializer
    permission_classes = [AllowAny]


class RecyclableListingViewSet(viewsets.ModelViewSet):
    serializer_class = RecyclableListingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = RecyclableListing.objects.select_related(
            'resident',
            'recycler',
            'accepted_offer',
        )
        if user.user_type == 'household':
            return queryset.filter(resident=user)
        if user.user_type == 'recycler':
            return queryset.filter(
                Q(status__in=['available', 'offer_pending']) |
                Q(recycler=user)
            ).distinct()
        if user.user_type == 'authority':
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.user_type != 'household':
            raise PermissionDenied('Only household users can list recyclables')

        household = Household.objects.filter(user=user).first()
        resident_lat = self.request.data.get('resident_location_lat')
        resident_long = self.request.data.get('resident_location_long')
        if resident_lat in (None, '', 'null') and household and household.location_lat is not None:
            resident_lat = household.location_lat
        if resident_long in (None, '', 'null') and household and household.location_long is not None:
            resident_long = household.location_long

        serializer.save(
            resident=user,
            resident_name=self.request.data.get('resident_name') or user.get_full_name() or user.username,
            resident_phone=self.request.data.get('resident_phone') or user.phone or '',
            resident_location=self.request.data.get('resident_location') or '',
            resident_location_lat=resident_lat,
            resident_location_long=resident_long,
        )

    @action(detail=True, methods=['post'])
    def schedule_pickup(self, request, pk=None):
        listing = self.get_object()
        if request.user.user_type != 'recycler':
            raise PermissionDenied('Only recyclers can schedule pickups')
        if listing.recycler_id != request.user.id:
            raise PermissionDenied('You are not assigned to this listing')
        if listing.status not in ['offer_accepted', 'scheduled']:
            return Response({'error': 'Listing is not ready for scheduling'}, status=status.HTTP_400_BAD_REQUEST)

        listing.scheduled_date = request.data.get('scheduled_date')
        listing.scheduled_time = request.data.get('scheduled_time')
        listing.status = 'scheduled'
        listing.save(update_fields=['scheduled_date', 'scheduled_time', 'status', 'updated_at'])
        return Response(RecyclableListingSerializer(listing).data)

    @action(detail=True, methods=['post'])
    def complete_pickup(self, request, pk=None):
        listing = self.get_object()
        if request.user.user_type != 'recycler':
            raise PermissionDenied('Only recyclers can complete pickups')
        if listing.recycler_id != request.user.id:
            raise PermissionDenied('You are not assigned to this listing')
        if listing.status != 'scheduled':
            return Response({'error': 'Only scheduled listings can be completed'}, status=status.HTTP_400_BAD_REQUEST)

        payment_method = request.data.get('payment_method', 'cash')
        actual_weight = request.data.get('actual_weight') or listing.estimated_weight
        mpesa_code = request.data.get('mpesa_code', '')
        completion_notes = request.data.get('completion_notes', '')

        with transaction.atomic():
            listing.actual_weight = actual_weight
            listing.status = 'completed'
            listing.completion_notes = completion_notes
            listing.save(update_fields=['actual_weight', 'status', 'completion_notes', 'updated_at'])

            tx = RecyclerTransaction.objects.create(
                listing=listing,
                recycler=request.user,
                material_type=listing.material_type,
                weight=actual_weight,
                price=listing.offered_price or 0,
                source=f'{listing.resident_name} - {listing.resident_location}',
                payment_method=payment_method,
                mpesa_code=mpesa_code or '',
            )

            # +5 points per kg recycled for resident households.
            try:
                weight_decimal = Decimal(str(actual_weight))
                earned_points = int((weight_decimal * Decimal('5')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            except (InvalidOperation, TypeError, ValueError):
                earned_points = 0
            award_household_credits(
                user=listing.resident,
                points=earned_points,
                description='Recyclables pickup completed',
                reference_id=listing.id,
            )

        return Response({
            'listing': RecyclableListingSerializer(listing).data,
            'transaction': RecyclerTransactionSerializer(tx).data,
        })


class PriceOfferViewSet(viewsets.ModelViewSet):
    serializer_class = PriceOfferSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = PriceOffer.objects.all().select_related('listing', 'recycler')
        if user.user_type == 'household':
            return queryset.filter(listing__resident=user)
        if user.user_type == 'recycler':
            return queryset.filter(recycler=user)
        if user.user_type == 'authority':
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.user_type != 'recycler':
            raise PermissionDenied('Only recyclers can create offers')

        listing = serializer.validated_data['listing']
        listing.status = 'offer_pending'
        listing.save(update_fields=['status', 'updated_at'])

        serializer.save(
            recycler=user,
            recycler_name=self.request.data.get('recycler_name') or user.get_full_name() or user.username,
            recycler_phone=self.request.data.get('recycler_phone') or user.phone or '',
        )

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        offer = self.get_object()
        listing = offer.listing
        if listing.resident_id != request.user.id:
            raise PermissionDenied('Only listing owner can accept offers')

        with transaction.atomic():
            offer.status = 'accepted'
            offer.save(update_fields=['status'])
            PriceOffer.objects.filter(listing=listing).exclude(id=offer.id).update(status='rejected')
            listing.status = 'offer_accepted'
            listing.accepted_offer = offer
            listing.recycler = offer.recycler
            listing.recycler_name = offer.recycler_name
            listing.offered_price = offer.offered_price
            listing.save(update_fields=['status', 'accepted_offer', 'recycler', 'recycler_name', 'offered_price', 'updated_at'])

        return Response(PriceOfferSerializer(offer).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        offer = self.get_object()
        listing = offer.listing
        if listing.resident_id != request.user.id:
            raise PermissionDenied('Only listing owner can reject offers')

        offer.status = 'rejected'
        offer.reject_reason = request.data.get('reason', '') or ''
        offer.save(update_fields=['status', 'reject_reason'])

        has_pending = PriceOffer.objects.filter(listing=listing, status='pending').exists()
        if not has_pending and listing.status == 'offer_pending':
            listing.status = 'available'
            listing.save(update_fields=['status', 'updated_at'])

        return Response(PriceOfferSerializer(offer).data)


class RecyclerTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = RecyclerTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = RecyclerTransaction.objects.all().select_related('recycler', 'listing')
        if user.user_type == 'recycler':
            return queryset.filter(recycler=user)
        if user.user_type == 'authority':
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.user_type != 'recycler':
            raise PermissionDenied('Only recyclers can create transactions')
        serializer.save(recycler=user)


class CollectorTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = CollectorTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CollectorTransaction.objects.all().select_related(
            'collector',
            'collector__user',
            'collection_request',
            'collection_request__household',
            'collection_request__household__user',
        )
        if user.user_type == 'collector':
            collector = Collector.objects.filter(user=user).first()
            if not collector:
                return queryset.none()
            return queryset.filter(collector=collector)
        if user.user_type == 'authority':
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.user_type != 'collector':
            raise PermissionDenied('Only collectors can create transactions')

        collector = Collector.objects.filter(user=user).first()
        if not collector:
            raise PermissionDenied('Collector profile not found')

        completion_notes = (self.request.data.get('completion_notes') or '').strip()

        with transaction.atomic():
            transaction_obj = serializer.save(collector=collector)
            collection_request = transaction_obj.collection_request
            collection_request.status = 'completed'

            instructions = collection_request.instructions or ''
            notes = []
            if instructions:
                notes.append(instructions.strip())
            if completion_notes:
                notes.append(f'Completion: {completion_notes}')
            notes.append(f'CompletedAt: {timezone.now().isoformat()}')
            collection_request.instructions = '\n'.join([note for note in notes if note])
            collection_request.save(update_fields=['status', 'instructions'])

class IllegalDumpingViewSet(viewsets.ModelViewSet):
    serializer_class = IllegalDumpingSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        base_qs = IllegalDumping.objects.select_related('reporter')
        if user.user_type == 'authority':
            return base_qs
        return base_qs.filter(reporter=user)
    
    def perform_create(self, serializer):
        raw_is_anonymous = self.request.data.get('is_anonymous', False)
        if isinstance(raw_is_anonymous, str):
            is_anonymous = raw_is_anonymous.strip().lower() in ('1', 'true', 'yes', 'on')
        else:
            is_anonymous = bool(raw_is_anonymous)
        if is_anonymous:
            serializer.save(reporter=None, is_anonymous=True)
        else:
            serializer.save(reporter=self.request.user)

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        report = serializer.save()
        if previous_status == 'resolved' or report.status != 'resolved' or not report.reporter_id:
            return
        already_rewarded = GreenCredit.objects.filter(
            household__user_id=report.reporter_id,
            transaction_type='earned',
            reference_id=report.id,
            description='Verified illegal dumping report',
        ).exists()
        if already_rewarded:
            return
        award_household_credits(
            user=report.reporter,
            points=25,
            description='Verified illegal dumping report',
            reference_id=report.id,
        )

class GreenCreditViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = GreenCreditSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.user_type == 'household':
            household = Household.objects.get(user=user)
            return GreenCredit.objects.filter(household=household).select_related('household')
        return GreenCredit.objects.none()


class ComplaintViewSet(viewsets.ModelViewSet):
    serializer_class = ComplaintSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Allow suspended/unauthenticated users to submit complaints from login flow.
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Complaint.objects.none()
        base_qs = Complaint.objects.select_related('reporter')
        # Authorities see all complaints; others see their own
        if user.user_type == 'authority':
            return base_qs
        return base_qs.filter(reporter=user)

    def perform_create(self, serializer):
        reporter_id = self.request.data.get('reporter')
        if reporter_id:
            try:
                reporter = User.objects.get(id=reporter_id)
            except User.DoesNotExist:
                reporter = None
        else:
            reporter = self.request.user if self.request.user.is_authenticated else None

        serializer.save(reporter=reporter)


class SuspendedUserViewSet(viewsets.ModelViewSet):
    serializer_class = SuspendedUserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base_qs = SuspendedUser.objects.select_related('user')
        # Authority can view all; others see their suspend record
        if user.user_type == 'authority':
            return base_qs
        return base_qs.filter(user=user)

    def perform_create(self, serializer):
        # Only authority users should suspend others
        from rest_framework.exceptions import PermissionDenied

        if self.request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can suspend accounts')
        target_user = serializer.validated_data.get('user')
        SuspendedUser.objects.filter(user=target_user, active=True).update(active=False)
        serializer.save(active=True)
        cache.delete("api:list_users:v1")

    def perform_update(self, serializer):
        from rest_framework.exceptions import PermissionDenied

        if self.request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can update suspension records')
        serializer.save()
        cache.delete("api:list_users:v1")

    def perform_destroy(self, instance):
        from rest_framework.exceptions import PermissionDenied

        if self.request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can delete suspension records')
        instance.delete()
        cache.delete("api:list_users:v1")

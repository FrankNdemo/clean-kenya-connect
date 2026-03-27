from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.tokens import RefreshToken, AccessToken
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.db.models import Q
from django.db.models import Count, Exists, OuterRef, Prefetch
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.core.cache import cache
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import base64
import mimetypes
import hashlib
import logging
import json
from .models import *
from .county import location_matches_county, resolve_county_from_location
from .serializers import *
from .route_planner import build_collector_route_summary
from .auth_email import (
    build_password_reset_link,
    dispatch_email,
    get_email_delivery_status,
    send_password_reset_email,
    send_welcome_email,
)

logger = logging.getLogger(__name__)


def _get_profile_data_for_user(user, create_if_missing=True):
    try:
        if user.user_type == 'household':
            if create_if_missing:
                profile, _ = Household.objects.get_or_create(
                    user=user,
                    defaults={'full_name': user.get_full_name() or user.username},
                )
                return HouseholdSerializer(profile).data
            profile = Household.objects.filter(user=user).first()
            return HouseholdSerializer(profile).data if profile else {}
        if user.user_type == 'collector':
            if create_if_missing:
                profile, _ = Collector.objects.get_or_create(
                    user=user,
                    defaults={'company_name': user.username},
                )
                return CollectorSerializer(profile).data
            profile = Collector.objects.filter(user=user).first()
            return CollectorSerializer(profile).data if profile else {}
        if user.user_type == 'recycler':
            if create_if_missing:
                profile, _ = Recycler.objects.get_or_create(
                    user=user,
                    defaults={'company_name': user.username},
                )
                return RecyclerSerializer(profile).data
            profile = Recycler.objects.filter(user=user).first()
            return RecyclerSerializer(profile).data if profile else {}
        if user.user_type == 'authority':
            if create_if_missing:
                profile, _ = Authority.objects.get_or_create(
                    user=user,
                    defaults={'staff_name': user.get_full_name() or user.username},
                )
                return AuthoritySerializer(profile).data
            profile = Authority.objects.filter(user=user).first()
            return AuthoritySerializer(profile).data if profile else {}
    except Exception:
        logger.exception(
            'Failed to load profile data for user_id=%s user_type=%s',
            getattr(user, 'id', None),
            getattr(user, 'user_type', None),
        )
    return {}


def _get_jwt_cookie_kwargs(max_age=None):
    cookie_kwargs = {
        'httponly': True,
        'secure': getattr(settings, 'JWT_COOKIE_SECURE', False),
        'samesite': getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax'),
        'domain': getattr(settings, 'JWT_COOKIE_DOMAIN', None),
        'path': '/',
    }
    if getattr(settings, 'JWT_COOKIE_PERSISTENT', False) and max_age is not None:
        cookie_kwargs['max_age'] = max_age
    return cookie_kwargs


def _build_auth_response(user, refresh, access, status_code=200):
    profile_data = _get_profile_data_for_user(user, create_if_missing=False)
    resp = JsonResponse({
        'user': UserSerializer(user).data,
        'profile': profile_data,
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
        **_get_jwt_cookie_kwargs(max_age=refresh_max_age),
    )
    resp.set_cookie(
        'access_token',
        str(access),
        **_get_jwt_cookie_kwargs(max_age=access_max_age),
    )
    return resp


def _build_auth_response_for_user(user, status_code=200):
    refresh = RefreshToken.for_user(user)
    refresh['sid'] = getattr(settings, 'RUNTIME_SESSION_ID', '')
    access = refresh.access_token
    return _build_auth_response(user, refresh, access, status_code=status_code)


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


def _cache_event_cover_image_data(event):
    cover_image = getattr(event, 'cover_image', None)
    if not cover_image or not getattr(cover_image, 'name', ''):
        return

    raw_bytes = b''
    try:
        cover_image.open('rb')
        raw_bytes = cover_image.read()
    except Exception:
        logger.exception('Failed to read event cover image for event_id=%s', getattr(event, 'id', None))
        return
    finally:
        try:
            cover_image.close()
        except Exception:
            pass

    if not raw_bytes:
        return

    content_type = mimetypes.guess_type(cover_image.name)[0] or 'application/octet-stream'
    event.cover_image_data = base64.b64encode(raw_bytes).decode('ascii')
    event.cover_image_content_type = content_type
    event.save(update_fields=['cover_image_data', 'cover_image_content_type'])


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
        resp = _build_auth_response_for_user(user, status_code=201)
        cache.delete("api:list_users:v2")
        delivery_status = get_email_delivery_status()
        if delivery_status.get("configured"):
            try:
                dispatch_email(send_welcome_email, user, description=f"welcome email for user_id={user.id}")
            except Exception:
                logger.exception("Failed to queue welcome email for user_id=%s", user.id)
        else:
            logger.warning(
                "Welcome email skipped because production email delivery is not configured "
                "(%s) for user_id=%s",
                delivery_status.get('error') or ', '.join(delivery_status.get('notes', [])),
                user.id,
            )

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

        if getattr(settings, 'DEBUG', False):
            logger.debug(
                "[LOGIN DEBUG] Login successful for user_id=%s user_type=%s",
                user.id,
                user.user_type,
            )

        return _build_auth_response_for_user(user)
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[LOGIN DEBUG] Authentication failed.")
    return JsonResponse({'error': 'Invalid credentials'}, status=401)


@api_view(['GET'])
@permission_classes([AllowAny])
def email_delivery_status(request):
    return Response(get_email_delivery_status(), status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    normalized_email = serializer.validated_data['email']
    matching_users = User.objects.filter(email__iexact=normalized_email, is_active=True).order_by('-id')
    success_message = {
        'detail': 'If an account exists for that email, a password reset link has been sent.',
    }

    if not matching_users.exists():
        return Response(success_message, status=status.HTTP_200_OK)

    delivery_status = get_email_delivery_status()
    if not delivery_status.get('configured'):
        if delivery_status.get('provider') == 'brevo':
            if not delivery_status.get('api_key_valid'):
                detail = 'Brevo API key is invalid or revoked. Generate a new API key in Brevo and update Render.'
            elif delivery_status.get('sender_found') and not delivery_status.get('sender_active'):
                detail = 'Brevo sender exists but is not active. Verify it in Brevo, then redeploy.'
            elif not delivery_status.get('sender_found'):
                detail = 'Brevo sender was not found in your account. Create or verify it in Brevo.'
            else:
                detail = 'Set DJANGO_BREVO_API_KEY in Render and verify the sender in Brevo.'
            api_error = str(delivery_status.get('error') or '').strip()
            if api_error:
                detail = f'{detail} {api_error}'
        else:
            detail = 'Email delivery is not configured yet.'

        logger.error("Password reset email requested but email delivery is not configured: %s", detail)
        return Response(
            {'detail': detail},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    for user in matching_users:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_link = build_password_reset_link(request, uid, token)
        try:
            dispatch_email(
                send_password_reset_email,
                user,
                reset_link,
                description=f"password reset email for user_id={user.id}",
            )
        except Exception as exc:
            logger.exception("Failed to queue password reset email for user_id=%s", user.id)
            detail = 'Unable to send the password reset email right now. Please try again later.'
            exc_text = str(exc).strip()
            if exc_text:
                detail = f'{detail} {exc_text}'
            return Response(
                {'detail': detail},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    return Response(success_message, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def password_reset_validate(request):
    serializer = PasswordResetTokenSerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    return Response(
        {
            'detail': 'Reset link is valid.',
            'email': user.email,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data['user']
    user.set_password(serializer.validated_data['password'])
    user.save(update_fields=['password'])
    return _build_auth_response_for_user(user)


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
            **_get_jwt_cookie_kwargs(max_age=access_max_age),
        )
        return resp
    except Exception:
        return Response({'detail': 'Invalid refresh token'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout_user(request):
    # Clear auth cookies
    resp = Response({'detail': 'Logged out'}, status=status.HTTP_200_OK)
    cookie_domain = getattr(settings, 'JWT_COOKIE_DOMAIN', None)
    cookie_samesite = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    resp.delete_cookie('access_token', path='/', domain=cookie_domain, samesite=cookie_samesite)
    resp.delete_cookie('refresh_token', path='/', domain=cookie_domain, samesite=cookie_samesite)
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
            normalized_email = str(email).strip().lower()
            if normalized_email and User.objects.filter(email__iexact=normalized_email).exclude(id=user.id).exists():
                return Response({'email': ['Email already used. Try another email.']}, status=status.HTTP_400_BAD_REQUEST)
            user.email = normalized_email
            update_fields.append('email')

        phone = payload.get('phone')
        if phone is not None:
            normalized_phone = normalize_phone_number(phone)
            if normalized_phone and User.objects.filter(phone=normalized_phone).exclude(id=user.id).exists():
                return Response({'phone': ['Phone already used. Try another phone.']}, status=status.HTTP_400_BAD_REQUEST)
            user.phone = normalized_phone
            update_fields.append('phone')

        if update_fields:
            user.save(update_fields=list(set(update_fields)))
            cache.delete("api:list_users:v2")

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
@permission_classes([IsAuthenticated])
def list_users(request):
    cache_key = "api:list_users:v2"
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


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def manage_user(request, user_id):
    if not request.user.is_superuser:
        return Response({'detail': 'Superuser access required.'}, status=status.HTTP_403_FORBIDDEN)

    target_user = User.objects.filter(id=user_id).first()
    if not target_user:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PATCH':
        serializer = AdminUserPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_password = serializer.validated_data['password']
        target_user.set_password(new_password)
        target_user.save(update_fields=['password'])
        cache.delete("api:list_users:v2")
        return Response(
            {
                'detail': 'Password updated successfully.',
                'user': UserSerializer(target_user).data,
            },
            status=status.HTTP_200_OK,
        )

    if target_user.id == request.user.id:
        return Response({'detail': 'You cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)

    if target_user.is_superuser:
        remaining_superusers = User.objects.filter(is_superuser=True).exclude(id=target_user.id).count()
        if remaining_superusers < 1:
            return Response({'detail': 'At least one superuser account must remain.'}, status=status.HTTP_400_BAD_REQUEST)

    target_user.delete()
    cache.delete("api:list_users:v2")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([AllowAny])
def resolve_location_county(request):
    location = str(request.query_params.get('location') or '').strip()
    county = resolve_county_from_location(location)
    return Response(
        {
            'location': location,
            'county': county,
            'resolved': bool(county),
        },
        status=status.HTTP_200_OK,
    )


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
        resident_location = str(
            serializer.validated_data.get('address')
            or household.address
            or ''
        ).strip()
        resident_county = resolve_county_from_location(resident_location)
        if collector and resident_county and not location_matches_county(collector.service_areas or '', resident_county):
            collector_county = resolve_county_from_location(collector.service_areas or '')
            available_label = collector_county or 'another'
            raise ValidationError({
                'collector': f'Select a collector that serves {resident_county} County. The selected collector serves {available_label} County.',
            })
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

    @action(detail=False, methods=['get'], url_path='route-summary')
    def route_summary(self, request):
        user = request.user
        if user.user_type != 'collector':
            return Response({'detail': 'Collector access required'}, status=status.HTTP_403_FORBIDDEN)

        collector = Collector.objects.select_related('user').filter(user=user).first()
        if not collector:
            return Response({'detail': 'Collector profile not found'}, status=status.HTTP_404_NOT_FOUND)

        active_requests = CollectionRequest.objects.select_related(
            'household',
            'household__user',
            'waste_type',
            'collector',
            'collector__user',
        ).filter(
            collector=collector,
            status__in=['scheduled', 'in_progress'],
        ).order_by('scheduled_date', 'scheduled_time', 'created_at')

        origin_location = (
            request.query_params.get('origin_location')
            or collector.service_areas
            or collector.company_name
            or 'Nairobi, Kenya'
        )
        origin_lat = request.query_params.get('origin_lat')
        origin_lng = request.query_params.get('origin_lng')

        payload = {
            'collector_id': collector.id,
            'origin_location': origin_location,
            'origin_lat': origin_lat,
            'origin_lng': origin_lng,
            'requests': [
                {
                    'request_id': collection.id,
                    'location': collection.address,
                    'address_lat': float(collection.address_lat) if collection.address_lat is not None else None,
                    'address_long': float(collection.address_long) if collection.address_long is not None else None,
                    'user_name': collection.household.full_name,
                    'user_phone': collection.household.user.phone,
                    'waste_type': collection.waste_type.type_name,
                    'scheduled_date': collection.scheduled_date.isoformat(),
                    'scheduled_time': collection.scheduled_time.strftime('%H:%M'),
                    'status': collection.status,
                }
                for collection in active_requests
            ],
        }
        cache_key = 'collector-route-summary:' + hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode('utf-8')
        ).hexdigest()

        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached, status=status.HTTP_200_OK)

        summary = build_collector_route_summary(
            origin_location=origin_location,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            requests=payload['requests'],
        )
        cache.set(cache_key, summary, 20)
        return Response(summary, status=status.HTTP_200_OK)


class CollectionRequestUpdateViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionRequestUpdateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = CollectionRequestUpdate.objects.select_related(
            'collection_request',
            'collection_request__household',
            'collection_request__household__user',
            'collection_request__collector',
            'collection_request__collector__user',
            'sender',
        )

        request_id = self.request.query_params.get('collection_request') or self.request.query_params.get('request')
        if request_id:
            queryset = queryset.filter(collection_request_id=request_id)

        if user.user_type == 'household':
            return queryset.filter(collection_request__household__user=user)
        if user.user_type == 'collector':
            return queryset.filter(collection_request__collector__user=user)
        if user.user_type == 'authority':
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        collection_request = serializer.validated_data['collection_request']

        if user.user_type == 'household':
            if collection_request.household.user_id != user.id:
                raise PermissionDenied('You can only reply on your own pickup requests')
        elif user.user_type == 'collector':
            if not collection_request.collector or collection_request.collector.user_id != user.id:
                raise PermissionDenied('You can only message residents for pickups assigned to you')
        elif user.user_type != 'authority':
            raise PermissionDenied('You are not allowed to create pickup updates')

        serializer.save(sender=user)

class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _parse_status_filters(self):
        status_param = self.request.query_params.get('status', '')
        if not status_param:
            return []

        valid_statuses = {choice for choice, _ in Event.STATUS_CHOICES}
        return [
            status
            for status in (
                value.strip()
                for value in status_param.split(',')
            )
            if status and status in valid_statuses
        ]

    def _event_queryset(self, include_participants=False):
        queryset = Event.objects.select_related('creator').annotate(
            participant_count_cached=Count('participants', distinct=True)
        )

        if self.request.user.is_authenticated:
            queryset = queryset.annotate(
                is_joined_cached=Exists(
                    EventParticipant.objects.filter(
                        event_id=OuterRef('pk'),
                        user_id=self.request.user.id,
                    )
                )
            )

        if include_participants:
            queryset = queryset.prefetch_related(
                Prefetch('participants', queryset=EventParticipant.objects.only('id', 'event_id', 'user_id'))
            )

        return queryset
    
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
        queryset = self._event_queryset(include_participants=self.action == 'retrieve')
        statuses = self._parse_status_filters()
        if statuses:
            queryset = queryset.filter(status__in=statuses)
        return queryset

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['include_participants'] = self.action in ['retrieve']
        return context

    def perform_create(self, serializer):
        event = serializer.save(creator=self.request.user)
        _cache_event_cover_image_data(event)
        # Creator is auto-registered as a participant for parity with frontend behavior
        EventParticipant.objects.get_or_create(event=event, user=self.request.user)

    def perform_update(self, serializer):
        event = serializer.save()
        _cache_event_cover_image_data(event)
    
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

        return Response(self.get_serializer(event).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        event = self.get_object()
        if request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can approve events')
        event.status = 'approved'
        event.save(update_fields=['status'])
        return Response(self.get_serializer(event).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        event = self.get_object()
        if request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can reject events')
        event.status = 'rejected'
        event.save(update_fields=['status'])
        return Response(self.get_serializer(event).data)

    def perform_destroy(self, instance):
        if instance.creator_id != self.request.user.id:
            raise PermissionDenied('Only event organizer can delete this event')

        cover_image = getattr(instance, 'cover_image', None)
        if cover_image:
            cover_image.delete(save=False)

        instance.delete()

    @action(detail=False, methods=['get'])
    def my_events(self, request):
        self._expire_past_events()
        user = request.user
        queryset = self._event_queryset().filter(
            Q(creator=user) | Q(participants__user=user)
        ).distinct()
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def my_expired_created(self, request):
        self._expire_past_events()
        user = request.user
        queryset = self._event_queryset().filter(
            creator=user,
            status='expired'
        ).order_by('-event_date')
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
        cache.delete("api:list_users:v2")

    def perform_update(self, serializer):
        from rest_framework.exceptions import PermissionDenied

        if self.request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can update suspension records')
        serializer.save()
        cache.delete("api:list_users:v2")

    def perform_destroy(self, instance):
        from rest_framework.exceptions import PermissionDenied

        if self.request.user.user_type != 'authority':
            raise PermissionDenied('Only authority users can delete suspension records')
        instance.delete()
        cache.delete("api:list_users:v2")

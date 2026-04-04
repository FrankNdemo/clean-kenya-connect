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
from django.http import FileResponse, Http404, HttpResponse, JsonResponse
from django.db.models import Q
from django.db.models import Count, Exists, OuterRef, Prefetch
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.core.cache import cache
from django.urls import reverse
from datetime import timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import base64
import mimetypes
import hashlib
import logging
import json
from .models import *
from .county import location_matches_county, resolve_county_from_location, split_location_parts
from .serializers import *
from .route_planner import build_collector_route_summary, calculate_distance_km, resolve_point
from .auth_email import (
    build_password_reset_link,
    dispatch_email,
    get_email_delivery_status,
    send_password_reset_email,
    send_reward_redemption_email,
    send_welcome_email,
)
from .mpesa import MpesaIntegrationError, initiate_stk_push, mpesa_is_configured

logger = logging.getLogger(__name__)


def _get_collector_match_max_distance_km():
    try:
        return float(getattr(settings, 'COLLECTOR_MATCH_MAX_DISTANCE_KM', 20.0))
    except (TypeError, ValueError):
        return 20.0


def _build_mpesa_callback_url(request):
    configured_url = str(getattr(settings, 'MPESA_CALLBACK_URL', '') or '').strip()
    if configured_url:
        return configured_url

    callback_path = reverse('mpesa_stk_callback')
    public_api_url = str(getattr(settings, 'API_PUBLIC_URL', '') or '').strip()
    if public_api_url:
        return f"{public_api_url.rstrip('/')}{callback_path}"
    return request.build_absolute_uri(callback_path)


def _parse_decimal_field(value, *, field_name, default=None, min_value=None):
    candidate = value
    if candidate in (None, '', 'null'):
        candidate = default
    if candidate in (None, '', 'null'):
        raise ValidationError({field_name: 'This field is required.'})

    try:
        parsed = Decimal(str(candidate))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({field_name: 'Enter a valid number.'})

    if min_value is not None and parsed < Decimal(str(min_value)):
        raise ValidationError({field_name: f'Value must be at least {min_value}.'})

    return parsed


def _parse_optional_float(value, *, field_name):
    if value in (None, '', 'null'):
        return None

    try:
        return float(str(value))
    except (TypeError, ValueError):
        raise ValidationError({field_name: 'Enter a valid number.'})


def _extract_mpesa_callback(payload):
    body = payload.get('Body') if isinstance(payload, dict) else {}
    callback = body.get('stkCallback') if isinstance(body, dict) else {}
    metadata_items = []
    if isinstance(callback, dict):
        callback_metadata = callback.get('CallbackMetadata') or {}
        if isinstance(callback_metadata, dict):
            metadata_items = callback_metadata.get('Item') or []

    metadata = {}
    if isinstance(metadata_items, list):
        for item in metadata_items:
            if not isinstance(item, dict):
                continue
            name = str(item.get('Name') or '').strip()
            if not name:
                continue
            metadata[name] = item.get('Value')

    def _stringify(value):
        if value is None:
            return ''
        return str(value).strip()

    return {
        'merchant_request_id': _stringify(callback.get('MerchantRequestID')),
        'checkout_request_id': _stringify(callback.get('CheckoutRequestID')),
        'result_code': _stringify(callback.get('ResultCode')),
        'result_desc': _stringify(callback.get('ResultDesc')),
        'metadata': metadata,
    }


def _mark_collection_request_completed(collection_request, completion_notes=''):
    instructions = str(collection_request.instructions or '').strip()
    notes = [instructions] if instructions else []
    if completion_notes:
        notes.append(f'Completion: {completion_notes}')
    notes.append(f'CompletedAt: {timezone.now().isoformat()}')
    collection_request.status = 'completed'
    collection_request.instructions = '\n'.join(note for note in notes if note)
    collection_request.save(update_fields=['status', 'instructions'])


def _set_collection_request_completion_notes(collection_request, completion_notes=''):
    lines = [
        str(line).strip()
        for line in str(collection_request.instructions or '').splitlines()
        if str(line).strip()
    ]
    completed_at_lines = [line for line in lines if line.startswith('CompletedAt:')]
    preserved_lines = [
        line for line in lines if not line.startswith('Completion:') and not line.startswith('CompletedAt:')
    ]
    if completion_notes:
        preserved_lines.append(f'Completion: {completion_notes}')
    preserved_lines.extend(completed_at_lines)
    collection_request.instructions = '\n'.join(preserved_lines)
    collection_request.save(update_fields=['instructions'])


def _award_recyclable_listing_completion_credits(listing, weight_value):
    try:
        earned_points = int((weight_value * Decimal('5')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError, ValueError):
        earned_points = 0

    award_household_credits(
        user=listing.resident,
        points=earned_points,
        description='Recyclables pickup completed',
        reference_id=listing.id,
    )


def _finalize_mpesa_payment(payment):
    if payment.status != 'success':
        return payment

    if payment.payment_scope == 'collector_pickup':
        collection_request = payment.collection_request
        if not collection_request:
            raise ValidationError({'detail': 'Collector pickup payment is missing its collection request.'})

        collector_transaction = payment.collector_transaction
        if not collector_transaction:
            collector_transaction = CollectorTransaction.objects.filter(collection_request=collection_request).first()

        if collector_transaction:
            update_fields = []
            if collector_transaction.payment_method != 'mpesa':
                collector_transaction.payment_method = 'mpesa'
                update_fields.append('payment_method')
            if payment.mpesa_receipt_number and collector_transaction.mpesa_code != payment.mpesa_receipt_number:
                collector_transaction.mpesa_code = payment.mpesa_receipt_number
                update_fields.append('mpesa_code')
            if update_fields:
                collector_transaction.save(update_fields=update_fields)
        else:
            collector = collection_request.collector or Collector.objects.filter(user=payment.initiated_by).first()
            if not collector:
                raise ValidationError({'detail': 'Collector profile not found for this payment.'})

            collector_transaction = CollectorTransaction.objects.create(
                collection_request=collection_request,
                collector=collector,
                total_weight=payment.recorded_weight or Decimal('0'),
                total_price=payment.amount,
                payment_method='mpesa',
                mpesa_code=payment.mpesa_receipt_number or '',
            )

        payment_updates = []
        if payment.collector_transaction_id != collector_transaction.id:
            payment.collector_transaction = collector_transaction
            payment_updates.append('collector_transaction')

        if payment_updates:
            payment.save(update_fields=payment_updates)

        if collection_request.status != 'completed':
            _mark_collection_request_completed(collection_request, payment.completion_notes)

        return payment

    if payment.payment_scope == 'recycler_pickup':
        listing = payment.recyclable_listing
        if not listing:
            raise ValidationError({'detail': 'Recycler pickup payment is missing its recyclable listing.'})

        weight_value = payment.recorded_weight or listing.actual_weight or listing.estimated_weight or Decimal('0')
        recycler_transaction = payment.recycler_transaction
        if not recycler_transaction:
            recycler_transaction = RecyclerTransaction.objects.filter(listing=listing).order_by('-created_at').first()

        created_transaction = False
        if recycler_transaction:
            update_fields = []
            if recycler_transaction.payment_method != 'mpesa':
                recycler_transaction.payment_method = 'mpesa'
                update_fields.append('payment_method')
            if payment.mpesa_receipt_number and recycler_transaction.mpesa_code != payment.mpesa_receipt_number:
                recycler_transaction.mpesa_code = payment.mpesa_receipt_number
                update_fields.append('mpesa_code')
            if update_fields:
                recycler_transaction.save(update_fields=update_fields)
        else:
            recycler_transaction = RecyclerTransaction.objects.create(
                listing=listing,
                recycler=listing.recycler or payment.initiated_by,
                material_type=listing.material_type,
                weight=weight_value,
                price=payment.amount,
                source=f'{listing.resident_name} - {listing.resident_location}',
                payment_method='mpesa',
                mpesa_code=payment.mpesa_receipt_number or '',
            )
            created_transaction = True

        payment_updates = []
        if payment.recycler_transaction_id != recycler_transaction.id:
            payment.recycler_transaction = recycler_transaction
            payment_updates.append('recycler_transaction')
        if payment.recorded_weight != weight_value:
            payment.recorded_weight = weight_value
            payment_updates.append('recorded_weight')
        if payment_updates:
            payment.save(update_fields=payment_updates)

        listing_updates = []
        if listing.actual_weight != weight_value:
            listing.actual_weight = weight_value
            listing_updates.append('actual_weight')
        if listing.status != 'completed':
            listing.status = 'completed'
            listing_updates.append('status')
        if payment.completion_notes and listing.completion_notes != payment.completion_notes:
            listing.completion_notes = payment.completion_notes
            listing_updates.append('completion_notes')
        if listing_updates:
            listing_updates.append('updated_at')
            listing.save(update_fields=list(dict.fromkeys(listing_updates)))

        if created_transaction:
            _award_recyclable_listing_completion_credits(listing, weight_value)

        return payment

    raise ValidationError({'detail': 'Unsupported M-Pesa payment scope.'})


def _apply_mpesa_callback_to_payment(payment, payload):
    callback = _extract_mpesa_callback(payload)
    metadata = callback.get('metadata') or {}
    result_code = str(callback.get('result_code') or '').strip()

    payment.raw_callback_payload = payload if isinstance(payload, dict) else {}
    payment.result_code = result_code
    payment.result_desc = str(callback.get('result_desc') or '').strip()
    payment.mpesa_receipt_number = str(metadata.get('MpesaReceiptNumber') or '').strip()

    if result_code == '0':
        payment.status = 'success'
    elif result_code == '1032':
        payment.status = 'cancelled'
    else:
        payment.status = 'failed'

    payment.save(
        update_fields=[
            'raw_callback_payload',
            'result_code',
            'result_desc',
            'mpesa_receipt_number',
            'status',
            'updated_at',
        ]
    )

    if payment.status == 'success':
        _finalize_mpesa_payment(payment)

    return payment


def _save_mpesa_completion_notes(payment, completion_notes=''):
    if payment.status != 'success':
        raise ValidationError({'detail': 'Completion notes can only be saved after a successful payment.'})

    cleaned_notes = str(completion_notes or '').strip()
    payment.completion_notes = cleaned_notes
    payment.save(update_fields=['completion_notes', 'updated_at'])

    if payment.payment_scope == 'collector_pickup' and payment.collection_request:
        _set_collection_request_completion_notes(payment.collection_request, cleaned_notes)
    elif payment.payment_scope == 'recycler_pickup' and payment.recyclable_listing:
        payment.recyclable_listing.completion_notes = cleaned_notes
        payment.recyclable_listing.save(update_fields=['completion_notes', 'updated_at'])

    return payment


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


def _cache_dumping_report_photo_data(report):
    photo = getattr(report, 'photo', None)
    if not photo or not getattr(photo, 'name', ''):
        update_fields = []
        if getattr(report, 'photo_data', ''):
            report.photo_data = ''
            update_fields.append('photo_data')
        if getattr(report, 'photo_content_type', ''):
            report.photo_content_type = ''
            update_fields.append('photo_content_type')
        if update_fields:
            report.save(update_fields=update_fields)
        return

    raw_bytes = b''
    try:
        photo.open('rb')
        raw_bytes = photo.read()
    except Exception:
        logger.exception(
            'Failed to read illegal dumping photo for report_id=%s',
            getattr(report, 'id', None),
        )
        return
    finally:
        try:
            photo.close()
        except Exception:
            pass

    if not raw_bytes:
        return

    content_type = mimetypes.guess_type(photo.name)[0] or 'application/octet-stream'
    report.photo_data = base64.b64encode(raw_bytes).decode('ascii')
    report.photo_content_type = content_type
    report.save(update_fields=['photo_data', 'photo_content_type'])


def dumping_report_photo(request, report_id):
    report = IllegalDumping.objects.only(
        'id',
        'photo',
        'photo_data',
        'photo_content_type',
    ).filter(pk=report_id).first()
    if not report:
        raise Http404('Dumping report photo not found.')

    photo = getattr(report, 'photo', None)
    if photo and getattr(photo, 'name', ''):
        try:
            storage = getattr(photo, 'storage', None)
            if storage is None or storage.exists(photo.name):
                photo.open('rb')
                content_type = getattr(report, 'photo_content_type', '') or mimetypes.guess_type(
                    photo.name
                )[0] or 'application/octet-stream'
                response = FileResponse(photo, content_type=content_type)
                response['Cache-Control'] = 'public, max-age=86400'
                return response
        except Exception:
            logger.exception(
                'Failed to serve illegal dumping photo file for report_id=%s',
                getattr(report, 'id', None),
            )

    photo_data = getattr(report, 'photo_data', '')
    if photo_data:
        try:
            raw_bytes = base64.b64decode(photo_data)
        except Exception:
            logger.exception(
                'Failed to decode cached illegal dumping photo for report_id=%s',
                getattr(report, 'id', None),
            )
        else:
            content_type = getattr(report, 'photo_content_type', '') or mimetypes.guess_type(
                getattr(photo, 'name', '')
            )[0] or 'application/octet-stream'
            response = HttpResponse(raw_bytes, content_type=content_type)
            response['Cache-Control'] = 'public, max-age=86400'
            return response

    raise Http404('Dumping report photo not found.')


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
    normalized_password = str(password or '')
    
    if getattr(settings, 'DEBUG', False):
        logger.debug("[LOGIN DEBUG] Login attempt received.")
    
    # Avoid double password-hash checks (slow) by resolving identifier once.
    identifier = (username_or_email or '').strip()
    if not identifier and not normalized_password:
        return JsonResponse({'error': 'Email and password are required.'}, status=400)
    if not identifier:
        return JsonResponse({'error': 'Email is required.'}, status=400)
    if not normalized_password:
        return JsonResponse({'error': 'Password is required.'}, status=400)

    user = None
    if identifier:
        if '@' in identifier:
            # Email may not be unique in legacy data; pick the account whose password matches.
            candidates = User.objects.filter(email__iexact=identifier, is_active=True).order_by('-id')
            for candidate in candidates:
                if candidate.check_password(normalized_password):
                    user = candidate
                    break
        else:
            # Username login remains compatible with default auth backend.
            user = authenticate(username=identifier, password=normalized_password)
    
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


def _resolve_collector_service_area_matches(service_areas):
    raw_service_areas = str(service_areas or '').strip()
    if not raw_service_areas:
        return []

    collector_county = resolve_county_from_location(raw_service_areas)
    candidates = split_location_parts(raw_service_areas) or [raw_service_areas]
    matches = []
    seen_labels = set()

    for candidate in candidates:
        area_label = str(candidate or '').strip()
        if not area_label:
            continue
        normalized_label = area_label.lower()
        if normalized_label in seen_labels:
            continue
        seen_labels.add(normalized_label)

        fallback_label = resolve_county_from_location(area_label) or collector_county or area_label
        point = resolve_point(label=area_label, fallback_label=fallback_label)
        if point is None:
            continue

        matches.append(
            {
                'area_label': area_label,
                'point': point,
            }
        )

    if matches:
        return matches

    if collector_county:
        point = resolve_point(label=collector_county, fallback_label=collector_county)
        if point is not None:
            return [{'area_label': collector_county, 'point': point}]

    return []


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_collector_matches(request):
    location = str(request.query_params.get('location') or '').strip()
    location_lat = _parse_optional_float(request.query_params.get('location_lat'), field_name='location_lat')
    location_long = _parse_optional_float(request.query_params.get('location_long'), field_name='location_long')

    if not location and (location_lat is None or location_long is None):
        raise ValidationError(
            {'location': 'Provide a location or live coordinates so we can find the nearest collectors.'}
        )

    resolved_county = resolve_county_from_location(location)
    max_distance_km = _get_collector_match_max_distance_km()
    pickup_point = resolve_point(
        label=location,
        lat=location_lat,
        lng=location_long,
        fallback_label=resolved_county or location or 'Nairobi, Kenya',
    )

    collectors = Collector.objects.select_related('user').filter(user__is_active=True)
    matches = []

    for collector in collectors:
        collector_user = collector.user
        collector_name = (
            str(collector.company_name or '').strip()
            or collector_user.get_full_name().strip()
            or collector_user.username
            or collector_user.email
        )
        collector_location = str(collector.service_areas or '').strip()
        collector_county = resolve_county_from_location(collector_location)
        service_area_matches = _resolve_collector_service_area_matches(collector_location)
        serves_requested_county = bool(
            resolved_county and location_matches_county(collector_location, resolved_county)
        )

        best_match = None
        distance_km = None
        if pickup_point is not None and service_area_matches:
            best_match = min(
                service_area_matches,
                key=lambda item: calculate_distance_km(pickup_point, item['point']),
            )
            distance_km = round(calculate_distance_km(pickup_point, best_match['point']), 2)
        elif service_area_matches:
            best_match = service_area_matches[0]

        is_economical_match = serves_requested_county or (
            distance_km is not None and distance_km <= max_distance_km
        )
        if not is_economical_match:
            continue

        matches.append(
            {
                'id': collector_user.id,
                'collector_id': collector.id,
                'name': collector_name,
                'phone': collector_user.phone or '',
                'location': collector_location,
                'county': collector_county,
                'serves_requested_county': serves_requested_county,
                'matched_area': best_match['area_label'] if best_match else '',
                'distance_km': distance_km,
                'point_source': best_match['point'].get('source', '') if best_match else '',
            }
        )

    matches.sort(
        key=lambda item: (
            not item['serves_requested_county'],
            item['distance_km'] is None,
            item['distance_km'] if item['distance_km'] is not None else float('inf'),
            item['name'].lower(),
        )
    )

    return Response(
        {
            'location': location,
            'resolved_county': resolved_county,
            'pickup_point': (
                {
                    'lat': round(float(pickup_point['lat']), 8),
                    'lng': round(float(pickup_point['lng']), 8),
                    'label': pickup_point.get('label', ''),
                    'source': pickup_point.get('source', ''),
                }
                if pickup_point is not None
                else None
            ),
            'matches': matches,
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


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok'}, status=status.HTTP_200_OK)

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
        schedule_changes_queryset = EventScheduleChange.objects.select_related('changed_by').only(
            'id',
            'event_id',
            'previous_event_date',
            'new_event_date',
            'previous_start_time',
            'new_start_time',
            'reason',
            'changed_at',
            'changed_by__username',
            'changed_by__first_name',
            'changed_by__last_name',
        ).order_by('-changed_at')

        queryset = Event.objects.select_related('creator').prefetch_related(
            Prefetch(
                'schedule_changes',
                queryset=schedule_changes_queryset,
            )
        ).annotate(
            participant_count_cached=Count('participants')
        )

        if self.action in ['list', 'my_events', 'my_expired_created']:
            queryset = queryset.defer('cover_image_data', 'cover_image_content_type')

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

    def _can_edit_event(self, user, event):
        return bool(
            user
            and user.is_authenticated
            and (event.creator_id == user.id or user.user_type == 'authority')
        )
    
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
        context['skip_cover_storage_check'] = self.action in ['list', 'my_events', 'my_expired_created']
        return context

    def perform_create(self, serializer):
        event = serializer.save(creator=self.request.user)
        _cache_event_cover_image_data(event)
        # Creator is auto-registered as a participant for parity with frontend behavior
        EventParticipant.objects.get_or_create(event=event, user=self.request.user)

    def perform_update(self, serializer):
        event = serializer.save()
        _cache_event_cover_image_data(event)

    def update(self, request, *args, **kwargs):
        event = self.get_object()
        if not self._can_edit_event(request.user, event):
            raise PermissionDenied('Only the event creator or county authority can edit this event')
        return super().update(request, *args, **kwargs)
    
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
            Q(creator=user) | Q(is_joined_cached=True)
        )
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

        if payment_method == 'mpesa' and not str(mpesa_code or '').strip():
            return Response({'error': 'M-Pesa transaction code is required.'}, status=status.HTTP_400_BAD_REQUEST)

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

    @action(detail=True, methods=['post'], url_path='mpesa/stk-push')
    def mpesa_stk_push(self, request, pk=None):
        listing = self.get_object()
        if request.user.user_type != 'recycler':
            raise PermissionDenied('Only recyclers can initiate M-Pesa for recyclables pickups')
        if listing.recycler_id != request.user.id:
            raise PermissionDenied('You are not assigned to this listing')
        if listing.status != 'scheduled':
            return Response({'detail': 'Only scheduled listings can receive an M-Pesa payment request.'}, status=status.HTTP_400_BAD_REQUEST)
        if not listing.offered_price or Decimal(str(listing.offered_price)) <= 0:
            return Response({'detail': 'This listing does not have a valid agreed price yet.'}, status=status.HTTP_400_BAD_REQUEST)
        if not mpesa_is_configured():
            return Response({'detail': 'M-Pesa is not configured on the server yet.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        phone_number = request.data.get('phone_number') or listing.resident_phone or listing.resident.phone
        actual_weight = _parse_decimal_field(
            request.data.get('actual_weight'),
            field_name='actual_weight',
            default=listing.estimated_weight,
            min_value='0.01',
        )
        completion_notes = str(request.data.get('completion_notes') or '').strip()

        payment = MpesaPayment.objects.create(
            initiated_by=request.user,
            payment_scope='recycler_pickup',
            recyclable_listing=listing,
            amount=listing.offered_price,
            recorded_weight=actual_weight,
            phone_number=str(phone_number or '').strip(),
            completion_notes=completion_notes,
        )

        try:
            stk_result = initiate_stk_push(
                phone_number=phone_number,
                amount=listing.offered_price,
                callback_url=_build_mpesa_callback_url(request),
                account_reference=f'RECYCLE-{listing.id}',
                transaction_desc=f'{listing.material_type.title()} pickup',
            )
        except MpesaIntegrationError as exc:
            payment.status = 'failed'
            payment.response_description = exc.message
            payment.raw_response_payload = exc.payload or {}
            payment.save(update_fields=['status', 'response_description', 'raw_response_payload', 'updated_at'])
            return Response(
                {
                    'detail': exc.message,
                    'payment': MpesaPaymentSerializer(payment).data,
                },
                status=exc.status_code,
            )

        response_payload = stk_result.get('response_payload') or {}
        payment.phone_number = stk_result.get('normalized_phone') or payment.phone_number
        payment.amount = Decimal(str(stk_result.get('normalized_amount') or payment.amount))
        payment.raw_request_payload = stk_result.get('request_payload') or {}
        payment.raw_response_payload = response_payload
        payment.merchant_request_id = str(response_payload.get('MerchantRequestID') or '').strip()
        payment.checkout_request_id = str(response_payload.get('CheckoutRequestID') or '').strip()
        payment.response_code = str(response_payload.get('ResponseCode') or '').strip()
        payment.response_description = str(response_payload.get('ResponseDescription') or '').strip()
        payment.customer_message = str(response_payload.get('CustomerMessage') or '').strip()
        payment.save(
            update_fields=[
                'phone_number',
                'amount',
                'raw_request_payload',
                'raw_response_payload',
                'merchant_request_id',
                'checkout_request_id',
                'response_code',
                'response_description',
                'customer_message',
                'updated_at',
            ]
        )

        return Response(MpesaPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


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

    @action(detail=False, methods=['post'], url_path='mpesa/stk-push')
    def mpesa_stk_push(self, request):
        user = request.user
        if user.user_type != 'collector':
            raise PermissionDenied('Only collectors can initiate M-Pesa for collection pickups')

        collector = Collector.objects.filter(user=user).first()
        if not collector:
            raise PermissionDenied('Collector profile not found')
        if not mpesa_is_configured():
            return Response({'detail': 'M-Pesa is not configured on the server yet.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        collection_request_id = request.data.get('collection_request') or request.data.get('collection_request_id')
        if collection_request_id in (None, '', 'null'):
            raise ValidationError({'collection_request': 'This field is required.'})

        collection_request = CollectionRequest.objects.select_related(
            'household',
            'household__user',
            'collector',
        ).filter(id=collection_request_id).first()
        if not collection_request:
            return Response({'detail': 'Pickup request not found.'}, status=status.HTTP_404_NOT_FOUND)
        if collection_request.collector_id != collector.id:
            raise PermissionDenied('This pickup is not assigned to you.')
        if collection_request.status not in ['scheduled', 'in_progress']:
            return Response({'detail': 'Only scheduled or in-progress pickups can receive an M-Pesa payment request.'}, status=status.HTTP_400_BAD_REQUEST)
        if CollectorTransaction.objects.filter(collection_request=collection_request).exists():
            return Response({'detail': 'This pickup has already been completed.'}, status=status.HTTP_400_BAD_REQUEST)

        total_weight = _parse_decimal_field(
            request.data.get('total_weight'),
            field_name='total_weight',
            min_value='0.01',
        )
        total_price = _parse_decimal_field(
            request.data.get('total_price'),
            field_name='total_price',
            min_value='1',
        )
        phone_number = request.data.get('phone_number') or collection_request.household.user.phone
        completion_notes = str(request.data.get('completion_notes') or '').strip()

        payment = MpesaPayment.objects.create(
            initiated_by=user,
            payment_scope='collector_pickup',
            collection_request=collection_request,
            amount=total_price,
            recorded_weight=total_weight,
            phone_number=str(phone_number or '').strip(),
            completion_notes=completion_notes,
        )

        try:
            stk_result = initiate_stk_push(
                phone_number=phone_number,
                amount=total_price,
                callback_url=_build_mpesa_callback_url(request),
                account_reference=f'COLLECT-{collection_request.id}',
                transaction_desc=f'Waste pickup {collection_request.id}',
            )
        except MpesaIntegrationError as exc:
            payment.status = 'failed'
            payment.response_description = exc.message
            payment.raw_response_payload = exc.payload or {}
            payment.save(update_fields=['status', 'response_description', 'raw_response_payload', 'updated_at'])
            return Response(
                {
                    'detail': exc.message,
                    'payment': MpesaPaymentSerializer(payment).data,
                },
                status=exc.status_code,
            )

        response_payload = stk_result.get('response_payload') or {}
        payment.phone_number = stk_result.get('normalized_phone') or payment.phone_number
        payment.amount = Decimal(str(stk_result.get('normalized_amount') or payment.amount))
        payment.raw_request_payload = stk_result.get('request_payload') or {}
        payment.raw_response_payload = response_payload
        payment.merchant_request_id = str(response_payload.get('MerchantRequestID') or '').strip()
        payment.checkout_request_id = str(response_payload.get('CheckoutRequestID') or '').strip()
        payment.response_code = str(response_payload.get('ResponseCode') or '').strip()
        payment.response_description = str(response_payload.get('ResponseDescription') or '').strip()
        payment.customer_message = str(response_payload.get('CustomerMessage') or '').strip()
        payment.save(
            update_fields=[
                'phone_number',
                'amount',
                'raw_request_payload',
                'raw_response_payload',
                'merchant_request_id',
                'checkout_request_id',
                'response_code',
                'response_description',
                'customer_message',
                'updated_at',
            ]
        )

        return Response(MpesaPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)


class MpesaPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MpesaPaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = MpesaPayment.objects.select_related(
            'initiated_by',
            'collection_request',
            'collection_request__household',
            'collection_request__household__user',
            'collection_request__collector',
            'recyclable_listing',
            'recyclable_listing__resident',
            'recyclable_listing__recycler',
            'collector_transaction',
            'collector_transaction__collector',
            'recycler_transaction',
            'recycler_transaction__listing',
        )
        if user.user_type == 'authority':
            return queryset
        return queryset.filter(initiated_by=user)

    @action(detail=True, methods=['post'], url_path='save-notes')
    def save_notes(self, request, pk=None):
        payment = self.get_object()
        payment = _save_mpesa_completion_notes(
            payment,
            request.data.get('completion_notes', ''),
        )
        return Response(MpesaPaymentSerializer(payment).data, status=status.HTTP_200_OK)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def mpesa_stk_callback(request):
    payload = request.data if isinstance(request.data, dict) else {}
    callback = _extract_mpesa_callback(payload)
    checkout_request_id = callback.get('checkout_request_id')
    merchant_request_id = callback.get('merchant_request_id')

    payment = None
    with transaction.atomic():
        if checkout_request_id:
            payment = MpesaPayment.objects.select_for_update().filter(checkout_request_id=checkout_request_id).first()
        if not payment and merchant_request_id:
            payment = MpesaPayment.objects.select_for_update().filter(merchant_request_id=merchant_request_id).first()

        if payment:
            _apply_mpesa_callback_to_payment(payment, payload)
        else:
            logger.warning(
                'Received M-Pesa callback with no matching payment checkout_request_id=%s merchant_request_id=%s',
                checkout_request_id,
                merchant_request_id,
            )

    return Response({'ResultCode': 0, 'ResultDesc': 'Accepted'})

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
            report = serializer.save(reporter=None, is_anonymous=True)
        else:
            report = serializer.save(reporter=self.request.user)
        _cache_dumping_report_photo_data(report)

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        report = serializer.save()
        _cache_dumping_report_photo_data(report)
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

    @action(detail=False, methods=['post'], url_path='redeem')
    def redeem(self, request):
        user = request.user
        if user.user_type != 'household':
            raise PermissionDenied('Only resident accounts can redeem rewards.')

        serializer = RewardRedemptionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reward_name = serializer.validated_data['reward_name']
        points_cost = serializer.validated_data['points_cost']

        with transaction.atomic():
            household = Household.objects.select_for_update().filter(user=user).first()
            if not household:
                raise ValidationError({'detail': 'Resident profile not found.'})

            if household.green_credits < points_cost:
                raise ValidationError({'points_cost': 'Not enough points to redeem this reward.'})

            household.green_credits -= points_cost
            household.save(update_fields=['green_credits'])
            redemption = GreenCredit.objects.create(
                household=household,
                transaction_type='redeemed',
                credits_amount=points_cost,
                description=f'Reward redemption requested: {reward_name}',
            )

        delivery_status = get_email_delivery_status()
        provider = str(delivery_status.get('provider') or '').strip().lower()
        can_expect_inbox_delivery = bool(delivery_status.get('configured')) and provider not in {'console', 'locmem'}
        email_sent = False
        if user.email:
            try:
                dispatch_email(
                    send_reward_redemption_email,
                    user,
                    reward_name,
                    points_cost,
                    description=f'reward redemption email for user_id={user.id}',
                )
                email_sent = can_expect_inbox_delivery
            except Exception:
                logger.exception(
                    'Failed to send reward redemption email for user_id=%s reward=%s',
                    user.id,
                    reward_name,
                )

        detail = 'Redeem request received. Check your email.'
        if not email_sent:
            detail = 'Redeem request received. Your reward will be processed and you will be contacted soon.'

        return Response(
            {
                'detail': detail,
                'emailSent': email_sent,
                'remainingCredits': household.green_credits,
                'transaction': GreenCreditSerializer(redemption).data,
            },
            status=status.HTTP_200_OK,
        )


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

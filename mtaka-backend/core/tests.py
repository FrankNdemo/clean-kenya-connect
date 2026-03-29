import base64
import json
import re
from io import BytesIO
from datetime import date, time
from decimal import Decimal
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from PIL import Image

from .county import location_matches_county, resolve_county_from_location
from .mpesa import get_mpesa_access_token, initiate_stk_push, mpesa_is_configured
from .models import (
    Authority,
    CollectionRequest,
    CollectionRequestUpdate,
    Collector,
    CollectorTransaction,
    Event,
    EventScheduleChange,
    Household,
    MpesaPayment,
    RecyclableListing,
    RecyclerTransaction,
    WasteType,
)


@override_settings(ALLOWED_HOSTS=['testserver'])
class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_endpoint_returns_ok_without_authentication(self):
        response = self.client.get('/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})


@override_settings(ALLOWED_HOSTS=['testserver'])
class SuperuserBootstrapTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()

    def test_ensure_superuser_creates_or_repairs_seed_account(self):
        call_command('ensure_superuser')

        user = self.user_model.objects.get(username='ndemo frank')
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password('Ombogo1234.'))

        authority = Authority.objects.get(user=user)
        self.assertEqual(authority.staff_name, 'ndemo frank')


@override_settings(
    MPESA_ENV='"sandbox"',
    MPESA_CONSUMER_KEY='"test-key"',
    MPESA_CONSUMER_SECRET="'test-secret'",
    MPESA_BUSINESS_SHORTCODE='"174379"',
    MPESA_PASSKEY="'test-passkey'",
    MPESA_TRANSACTION_TYPE='"CustomerPayBillOnline"',
)
class MpesaConfigurationNormalizationTests(TestCase):
    def setUp(self):
        cache.clear()

    @patch('core.mpesa._http_json')
    def test_access_token_request_strips_wrapped_credentials(self, mock_http_json):
        mock_http_json.return_value = {'access_token': 'token-123'}

        token = get_mpesa_access_token()

        self.assertEqual(token, 'token-123')
        self.assertTrue(mpesa_is_configured())
        self.assertEqual(mock_http_json.call_args.kwargs['url'], 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials')
        self.assertEqual(
            mock_http_json.call_args.kwargs['headers']['Authorization'],
            f"Basic {base64.b64encode(b'test-key:test-secret').decode('utf-8')}",
        )

    @patch('core.mpesa._http_json')
    @patch('core.mpesa.get_mpesa_access_token', return_value='token-123')
    @patch('core.mpesa._nairobi_timestamp', return_value='20260329010101')
    def test_stk_push_strips_wrapped_shortcode_and_passkey(
        self,
        mock_timestamp,
        mock_get_token,
        mock_http_json,
    ):
        mock_http_json.return_value = {'ResponseCode': '0'}

        result = initiate_stk_push(
            phone_number='0712345678',
            amount='850',
            callback_url='https://example.com/callback',
            account_reference='MTAKA',
            transaction_desc='Waste pickup',
        )

        self.assertEqual(result['response_payload']['ResponseCode'], '0')
        payload = mock_http_json.call_args.kwargs['payload']
        self.assertEqual(mock_http_json.call_args.kwargs['url'], 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest')
        self.assertEqual(payload['BusinessShortCode'], '174379')
        self.assertEqual(payload['PartyB'], '174379')
        self.assertEqual(payload['TransactionType'], 'CustomerPayBillOnline')
        self.assertEqual(
            payload['Password'],
            base64.b64encode(b'174379test-passkey20260329010101').decode('utf-8'),
        )


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    DEBUG=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='M-Taka No-Reply <no-reply@example.com>',
    FRONTEND_URL='https://mtaka.example',
    PASSWORD_RESET_TIMEOUT=3600,
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        if hasattr(mail, 'outbox'):
            mail.outbox.clear()

    def test_registration_persists_household_location_and_returns_profile_and_tokens(self):
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'email': 'resident@example.com',
                'password': 'StrongPass!1',
                'password2': 'StrongPass!1',
                'user_type': 'household',
                'phone': '+254700000001',
                'full_name': 'Resident One',
                'location': 'Westlands, Nairobi',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['user']['location'], 'Westlands, Nairobi')
        self.assertEqual(response.json()['profile']['address'], 'Westlands, Nairobi')
        self.assertIn('access', response.json())
        self.assertIn('refresh', response.json())
        self.assertEqual(
            Household.objects.get(user__email='resident@example.com').address,
            'Westlands, Nairobi',
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['resident@example.com'])
        self.assertEqual(mail.outbox[0].from_email, 'M-Taka No-Reply <no-reply@example.com>')
        self.assertIn('Welcome to M-Taka', mail.outbox[0].subject)

    def test_refresh_accepts_refresh_token_from_request_body(self):
        register_response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'email': 'refresh@example.com',
                'password': 'StrongPass!1',
                'password2': 'StrongPass!1',
                'user_type': 'household',
                'phone': '+254700000002',
                'full_name': 'Refresh User',
                'location': 'Kilimani, Nairobi',
            }),
            content_type='application/json',
        )
        refresh_token = register_response.json()['refresh']

        refresh_response = self.client.post(
            '/api/auth/token/refresh/',
            data={'refresh': refresh_token},
            format='json',
        )

        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn('access', refresh_response.json())


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    DEBUG=True,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='M-Taka No-Reply <no-reply@example.com>',
    FRONTEND_URL='https://mtaka.example',
    PASSWORD_RESET_TIMEOUT=3600,
    ALLOWED_HOSTS=['testserver'],
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class EventImageUploadTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username='event-organizer',
            email='event-organizer@example.com',
            password='StrongPass!1',
            user_type='authority',
            phone='+254700009003',
        )
        self.client.force_authenticate(user=self.user)

    def test_event_cover_image_is_saved_and_returned(self):
        buffer = BytesIO()
        Image.new('RGB', (1, 1), color='green').save(buffer, format='PNG')
        cover_image = SimpleUploadedFile(
            'event-cover.png',
            buffer.getvalue(),
            content_type='image/png',
        )

        with TemporaryDirectory(ignore_cleanup_errors=True) as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.post(
                '/api/auth/events/',
                data={
                    'type': 'cleanup',
                    'title': 'Community Cleanup Day',
                    'description': 'Bring gloves and join the cleanup.',
                    'date': '2026-03-31',
                    'time': '10:30',
                    'location': 'Siriba campus',
                    'maxParticipants': 50,
                    'rewardPoints': 25,
                    'status': 'pending',
                    'cover_image': cover_image,
                },
                format='multipart',
            )
            self.assertEqual(response.status_code, 201)
            payload = response.json()
            self.assertIn('coverImageUrl', payload)
            self.assertTrue(payload['coverImageUrl'].startswith('http://testserver/media/event_covers/'))

            media_response = self.client.get(urlsplit(payload['coverImageUrl']).path)
            media_file = getattr(media_response, 'file_to_stream', None)
            try:
                self.assertEqual(media_response.status_code, 200)
                self.assertEqual(media_response['Content-Type'], 'image/png')
            finally:
                if hasattr(media_file, 'close'):
                    media_file.close()

            event = Event.objects.get(event_name='Community Cleanup Day')
            with patch.object(event.cover_image.storage, 'exists', return_value=False):
                refreshed_response = self.client.get('/api/auth/events/')
            self.assertEqual(refreshed_response.status_code, 200)
            refreshed_payload = next(item for item in refreshed_response.json() if item['id'] == event.id)
            self.assertTrue(refreshed_payload['coverImageUrl'].startswith('data:image/png;base64,'))
            self.assertEqual(refreshed_payload['participantCount'], 1)
            self.assertTrue(refreshed_payload['isJoined'])
            self.assertEqual(refreshed_payload['participants'], [])

        self.assertTrue(Event.objects.filter(event_name='Community Cleanup Day').exists())

    def test_event_list_can_filter_by_status_values(self):
        pending_event = Event.objects.create(
            creator=self.user,
            event_name='Pending Cleanup',
            event_type='cleanup',
            description='Pending event for filter testing.',
            location='Siriba campus',
            event_date=date(2026, 4, 8),
            start_time=time(10, 0),
            max_participants=20,
            status='pending',
            reward_points=20,
        )
        approved_event = Event.objects.create(
            creator=self.user,
            event_name='Approved Cleanup',
            event_type='cleanup',
            description='Approved event for filter testing.',
            location='Siriba campus',
            event_date=date(2026, 4, 9),
            start_time=time(11, 0),
            max_participants=20,
            status='approved',
            reward_points=20,
        )

        response = self.client.get('/api/auth/events/?status=pending,approved')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        returned_ids = {item['id'] for item in payload}
        self.assertSetEqual(returned_ids, {pending_event.id, approved_event.id})

    def test_event_creator_can_delete_event(self):
        event = Event.objects.create(
            creator=self.user,
            event_name='Delete Me Cleanup',
            event_type='cleanup',
            description='This event should be removable by its creator.',
            location='Siriba campus',
            event_date=date(2026, 3, 31),
            start_time=time(10, 30),
            max_participants=25,
            status='pending',
            reward_points=20,
        )

        response = self.client.delete(f'/api/auth/events/{event.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Event.objects.filter(id=event.id).exists())

    def test_only_event_creator_can_delete_event(self):
        other_user = self.user_model.objects.create_user(
            username='other-event-user',
            email='other-event-user@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009004',
        )
        event = Event.objects.create(
            creator=self.user,
            event_name='Protected Event',
            event_type='cleanup',
            description='Only the creator should be able to delete this event.',
            location='Siriba campus',
            event_date=date(2026, 4, 2),
            start_time=time(9, 0),
            max_participants=30,
            status='approved',
            reward_points=30,
        )

        self.client.force_authenticate(user=other_user)
        response = self.client.delete(f'/api/auth/events/{event.id}/')

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Event.objects.filter(id=event.id).exists())

    def test_event_creator_can_reschedule_own_event_with_reason(self):
        creator = self.user_model.objects.create_user(
            username='resident-creator',
            email='resident-creator@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009100',
        )
        event = Event.objects.create(
            creator=creator,
            event_name='Neighborhood Cleanup',
            event_type='cleanup',
            description='Weekend cleanup',
            location='Kisumu',
            event_date=date(2026, 4, 10),
            start_time=time(9, 0),
            max_participants=40,
            status='approved',
            reward_points=25,
        )

        self.client.force_authenticate(user=creator)
        response = self.client.patch(
            f'/api/auth/events/{event.id}/',
            data={
                'date': '2026-04-12',
                'time': '10:30',
                'scheduleChangeReason': 'Rain forecast moved the cleanup to Sunday.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        event.refresh_from_db()
        self.assertEqual(event.event_date, date(2026, 4, 12))
        self.assertEqual(event.start_time, time(10, 30))
        self.assertEqual(EventScheduleChange.objects.filter(event=event, changed_by=creator).count(), 1)

        payload = response.json()
        self.assertEqual(payload['latestScheduleChange']['previousDate'], '2026-04-10')
        self.assertEqual(payload['latestScheduleChange']['newDate'], '2026-04-12')
        self.assertEqual(payload['latestScheduleChange']['reason'], 'Rain forecast moved the cleanup to Sunday.')

    def test_event_schedule_change_requires_reason(self):
        event = Event.objects.create(
            creator=self.user,
            event_name='Reason Required Event',
            event_type='cleanup',
            description='Reason check',
            location='Siriba campus',
            event_date=date(2026, 4, 5),
            start_time=time(8, 0),
            max_participants=20,
            status='pending',
            reward_points=20,
        )

        response = self.client.patch(
            f'/api/auth/events/{event.id}/',
            data={
                'date': '2026-04-06',
                'time': '08:30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()['scheduleChangeReason'][0],
            'A reason is required when changing the event schedule.',
        )
        self.assertFalse(EventScheduleChange.objects.filter(event=event).exists())

    def test_authority_can_view_creator_contact_and_reschedule_event(self):
        creator = self.user_model.objects.create_user(
            username='cleanup-creator',
            email='cleanup-creator@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009200',
        )
        event = Event.objects.create(
            creator=creator,
            event_name='County Cleanup Day',
            event_type='cleanup',
            description='County-wide cleanup event.',
            location='Kisumu CBD',
            event_date=date(2026, 4, 15),
            start_time=time(9, 0),
            max_participants=60,
            status='pending',
            reward_points=30,
        )

        response = self.client.patch(
            f'/api/auth/events/{event.id}/',
            data={
                'date': '2026-04-16',
                'time': '11:00',
                'scheduleChangeReason': 'County authority moved the event to avoid a scheduling clash.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['creatorEmail'], 'cleanup-creator@example.com')
        self.assertEqual(payload['creatorPhone'], '+254700009200')
        self.assertEqual(payload['latestScheduleChange']['previousDate'], '2026-04-15')
        self.assertEqual(payload['latestScheduleChange']['newDate'], '2026-04-16')
        self.assertEqual(
            payload['latestScheduleChange']['reason'],
            'County authority moved the event to avoid a scheduling clash.',
        )

        schedule_change = EventScheduleChange.objects.get(event=event)
        self.assertEqual(schedule_change.changed_by, self.user)

    def test_non_creator_non_authority_cannot_edit_event(self):
        creator = self.user_model.objects.create_user(
            username='event-owner',
            email='event-owner@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009300',
        )
        outsider = self.user_model.objects.create_user(
            username='event-outsider',
            email='event-outsider@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009301',
        )
        event = Event.objects.create(
            creator=creator,
            event_name='Protected Edit Event',
            event_type='cleanup',
            description='Only creator or authority may edit.',
            location='Kakamega',
            event_date=date(2026, 4, 20),
            start_time=time(10, 0),
            max_participants=25,
            status='approved',
            reward_points=15,
        )

        self.client.force_authenticate(user=outsider)
        response = self.client.patch(
            f'/api/auth/events/{event.id}/',
            data={
                'date': '2026-04-21',
                'time': '11:00',
                'scheduleChangeReason': 'Trying to edit another user event.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(EventScheduleChange.objects.filter(event=event, changed_by=outsider).exists())

    def test_registration_rejects_duplicate_email_and_phone(self):
        self.user_model.objects.create_user(
            username='existing-user',
            email='existing@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001111',
        )

        duplicate_email_response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'email': 'existing@example.com',
                'password': 'StrongPass!1',
                'password2': 'StrongPass!1',
                'user_type': 'household',
                'phone': '+254700001112',
                'full_name': 'Duplicate Email',
                'location': 'Nairobi',
            }),
            content_type='application/json',
        )
        self.assertEqual(duplicate_email_response.status_code, 400)
        self.assertEqual(
            duplicate_email_response.json()['email'][0],
            'Email already used. Try another email.',
        )

        duplicate_phone_response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'email': 'newperson@example.com',
                'password': 'StrongPass!1',
                'password2': 'StrongPass!1',
                'user_type': 'household',
                'phone': '+254 700 001 111',
                'full_name': 'Duplicate Phone',
                'location': 'Nairobi',
            }),
            content_type='application/json',
        )
        self.assertEqual(duplicate_phone_response.status_code, 400)
        self.assertEqual(
            duplicate_phone_response.json()['phone'][0],
            'Phone already used. Try another phone.',
        )

    def test_password_reset_request_sends_email_with_frontend_reset_link(self):
        user = self.user_model.objects.create_user(
            username='reset-user',
            email='reset@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001202',
        )

        response = self.client.post(
            '/api/auth/password-reset/request/',
            data={'email': user.email},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [user.email])
        self.assertIn('Reset your M-Taka password', mail.outbox[0].subject)
        self.assertRegex(
            mail.outbox[0].body,
            r'https://mtaka\.example/#/reset-password\?uid=[^&\s]+&token=[^\s]+',
        )

    def test_password_reset_confirm_updates_password_and_returns_auth_payload(self):
        user = self.user_model.objects.create_user(
            username='reset-confirm-user',
            email='reset-confirm@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001203',
        )

        request_response = self.client.post(
            '/api/auth/password-reset/request/',
            data={'email': user.email},
            format='json',
        )
        self.assertEqual(request_response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

        match = re.search(
            r'uid=([^&\s]+)&token=([^\s]+)',
            mail.outbox[0].body,
        )
        self.assertIsNotNone(match)
        uid = match.group(1)
        token = match.group(2)

        validate_response = self.client.get(
            '/api/auth/password-reset/validate/',
            data={'uid': uid, 'token': token},
        )
        self.assertEqual(validate_response.status_code, 200)
        self.assertEqual(validate_response.json()['email'], user.email)

        confirm_response = self.client.post(
            '/api/auth/password-reset/confirm/',
            data={
                'uid': uid,
                'token': token,
                'password': 'NewStrongPass!2',
                'password2': 'NewStrongPass!2',
            },
            format='json',
        )

        self.assertEqual(confirm_response.status_code, 200)
        self.assertIn('user', confirm_response.json())
        self.assertIn('access', confirm_response.json())
        self.assertIn('refresh', confirm_response.json())

        user.refresh_from_db()
        self.assertTrue(user.check_password('NewStrongPass!2'))

        login_response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'username': user.email,
                'password': 'NewStrongPass!2',
            }),
            content_type='application/json',
        )
        self.assertEqual(login_response.status_code, 200)

    def test_login_succeeds_without_creating_a_missing_household_profile(self):
        user = self.user_model.objects.create_user(
            username='profile-missing-user',
            email='profile-missing@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001205',
        )

        self.assertFalse(Household.objects.filter(user=user).exists())

        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'username': user.email,
                'password': 'StrongPass!1',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['profile'], {})
        self.assertFalse(Household.objects.filter(user=user).exists())

    @override_settings(
        PASSWORD_HASHERS=[
            'django.contrib.auth.hashers.PBKDF2PasswordHasher',
            'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
            'django.contrib.auth.hashers.Argon2PasswordHasher',
            'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
            'django.contrib.auth.hashers.ScryptPasswordHasher',
            'django.contrib.auth.hashers.MD5PasswordHasher',
        ]
    )
    def test_login_accepts_legacy_md5_password_hashes_and_upgrades_them(self):
        user = self.user_model.objects.create_user(
            username='legacy-hash-user',
            email='legacy-hash@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001206',
        )
        user.password = make_password('StrongPass!1', hasher='md5')
        user.save(update_fields=['password'])

        self.assertTrue(user.password.startswith('md5$'))

        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'username': user.email,
                'password': 'StrongPass!1',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)

        user.refresh_from_db()
        self.assertFalse(user.password.startswith('md5$'))
        self.assertTrue(user.check_password('StrongPass!1'))

    def test_login_requires_email_and_password(self):
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'username': '',
                'password': '',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Email and password are required.')

    def test_login_requires_password_when_email_is_present(self):
        response = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'username': 'resident@example.com',
                'password': '',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Password is required.')

    def test_password_reset_validate_rejects_invalid_token(self):
        user = self.user_model.objects.create_user(
            username='invalid-reset-user',
            email='invalid-reset@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001204',
        )

        response = self.client.get(
            '/api/auth/password-reset/validate/',
            data={'uid': 'baduid', 'token': 'badtoken'},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['detail'][0], 'Invalid or expired reset link.')

    def test_profile_update_rejects_duplicate_email_and_phone(self):
        first_user = self.user_model.objects.create_user(
            username='first-user',
            email='first@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001200',
        )
        second_user = self.user_model.objects.create_user(
            username='second-user',
            email='second@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001201',
        )

        self.client.force_authenticate(user=first_user)

        duplicate_email_response = self.client.patch(
            '/api/auth/profile/',
            data={'email': second_user.email},
            format='json',
        )
        self.assertEqual(duplicate_email_response.status_code, 400)
        self.assertEqual(
            duplicate_email_response.json()['email'][0],
            'Email already used. Try another email.',
        )

        duplicate_phone_response = self.client.patch(
            '/api/auth/profile/',
            data={'phone': '+254 700 001 201'},
            format='json',
        )
        self.assertEqual(duplicate_phone_response.status_code, 400)
        self.assertEqual(
            duplicate_phone_response.json()['phone'][0],
            'Phone already used. Try another phone.',
        )

    def test_superuser_can_update_password_and_delete_other_users(self):
        superuser = self.user_model.objects.create_superuser(
            username='super-admin',
            email='super-admin@example.com',
            password='StrongPass!1',
            user_type='authority',
            phone='+254700001210',
        )
        target_user = self.user_model.objects.create_user(
            username='target-user',
            email='target-user@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001211',
        )

        self.client.force_authenticate(user=superuser)

        update_response = self.client.patch(
            f'/api/auth/users/{target_user.id}/',
            data={
                'password': 'NewStrongPass!2',
                'password2': 'NewStrongPass!2',
            },
            format='json',
        )
        self.assertEqual(update_response.status_code, 200)

        target_user.refresh_from_db()
        self.assertTrue(target_user.check_password('NewStrongPass!2'))

        delete_response = self.client.delete(f'/api/auth/users/{target_user.id}/')
        self.assertEqual(delete_response.status_code, 204)
        self.assertFalse(self.user_model.objects.filter(id=target_user.id).exists())

    def test_non_superuser_cannot_manage_other_users(self):
        authority_user = self.user_model.objects.create_user(
            username='authority-user',
            email='authority-user@example.com',
            password='StrongPass!1',
            user_type='authority',
            phone='+254700001212',
        )
        target_user = self.user_model.objects.create_user(
            username='manage-target',
            email='manage-target@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700001213',
        )

        self.client.force_authenticate(user=authority_user)

        response = self.client.patch(
            f'/api/auth/users/{target_user.id}/',
            data={
                'password': 'NewStrongPass!3',
                'password2': 'NewStrongPass!3',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 403)


class CountyResolutionTests(TestCase):
    def test_common_locations_map_to_the_expected_county(self):
        self.assertEqual(resolve_county_from_location('Kisiani'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Maseno, Kisumu County'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Kisumu East'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Karen'), 'Nairobi')
        self.assertEqual(resolve_county_from_location('Nairobi City County'), 'Nairobi')
        self.assertEqual(resolve_county_from_location('Voi, Taita Taveta'), 'Taita-Taveta')
        self.assertEqual(resolve_county_from_location('Muranga Town'), "Murang'a")
        self.assertTrue(location_matches_county('Kisiani', 'Kisumu'))
        self.assertTrue(location_matches_county('Maseno, Kisumu County', 'Kisumu'))
        self.assertFalse(location_matches_county('Kisiani', 'Nairobi'))
        self.assertTrue(location_matches_county('Voi, Taita Taveta', 'Taita-Taveta'))
        self.assertTrue(location_matches_county('Muranga Town', "Murang'a"))

    def test_location_resolution_endpoint_returns_the_expected_county(self):
        client = APIClient()
        response = client.get('/api/auth/location/resolve/', {'location': 'Kisiani'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['county'], 'Kisumu')


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class CollectionRequestUpdateTests(TestCase):
    def setUp(self):
        self.collector_client = APIClient()
        self.resident_client = APIClient()

        self.resident_user = __import__('django.contrib.auth').contrib.auth.get_user_model().objects.create_user(
            username='resident',
            email='resident@updates.test',
            password='StrongPass!1',
            user_type='household',
            phone='+254700000100',
        )
        self.collector_user = __import__('django.contrib.auth').contrib.auth.get_user_model().objects.create_user(
            username='collector',
            email='collector@updates.test',
            password='StrongPass!1',
            user_type='collector',
            phone='+254700000200',
        )
        self.household = Household.objects.create(
            user=self.resident_user,
            full_name='Resident Updates',
            address='Westlands, Nairobi',
        )
        self.collector = Collector.objects.create(
            user=self.collector_user,
            company_name='Collector Updates Ltd',
            service_areas='Westlands, Nairobi',
        )
        self.waste_type = WasteType.objects.create(
            type_name='General Waste',
            is_recyclable=False,
        )
        self.collection_request = CollectionRequest.objects.create(
            household=self.household,
            waste_type=self.waste_type,
            collector=self.collector,
            scheduled_date='2026-03-25',
            scheduled_time='09:00',
            status='scheduled',
            address='Westlands, Nairobi',
        )

        self.collector_client.force_authenticate(user=self.collector_user)
        self.resident_client.force_authenticate(user=self.resident_user)

    def test_collector_and_resident_updates_are_visible_to_each_other(self):
        create_message = self.collector_client.post(
            '/api/auth/collection-updates/',
            data={
                'collection_request': self.collection_request.id,
                'type': 'message',
                'message': 'I will arrive in 20 minutes.',
            },
            format='json',
        )
        self.assertEqual(create_message.status_code, 201)
        self.assertEqual(CollectionRequestUpdate.objects.count(), 1)

        resident_updates = self.resident_client.get('/api/auth/collection-updates/')
        self.assertEqual(resident_updates.status_code, 200)
        self.assertEqual(len(resident_updates.json()), 1)
        self.assertEqual(resident_updates.json()[0]['message'], 'I will arrive in 20 minutes.')

        create_reply = self.resident_client.post(
            '/api/auth/collection-updates/',
            data={
                'collection_request': self.collection_request.id,
                'type': 'resident_reply',
                'message': 'Okay, I will be available.',
            },
            format='json',
        )
        self.assertEqual(create_reply.status_code, 201)

        collector_updates = self.collector_client.get('/api/auth/collection-updates/')
        self.assertEqual(collector_updates.status_code, 200)
        self.assertEqual(len(collector_updates.json()), 2)


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class CollectionRequestCountyMatchingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()

        self.resident_user = self.user_model.objects.create_user(
            username='resident-kisumu',
            email='resident-kisumu@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700000300',
        )
        self.kisumu_collector_user = self.user_model.objects.create_user(
            username='collector-kisumu',
            email='collector-kisumu@example.com',
            password='StrongPass!1',
            user_type='collector',
            phone='+254700000301',
        )
        self.nairobi_collector_user = self.user_model.objects.create_user(
            username='collector-nairobi',
            email='collector-nairobi@example.com',
            password='StrongPass!1',
            user_type='collector',
            phone='+254700000302',
        )

        self.household = Household.objects.create(
            user=self.resident_user,
            full_name='Kisumu Resident',
            address='Kisiani',
        )
        self.kisumu_collector = Collector.objects.create(
            user=self.kisumu_collector_user,
            company_name='Kisumu Green Collectors',
            service_areas='Kisumu, Maseno, Chulaimbo',
        )
        self.nairobi_collector = Collector.objects.create(
            user=self.nairobi_collector_user,
            company_name='Nairobi Clean Team',
            service_areas='Karen, Westlands, Nairobi',
        )
        self.waste_type = WasteType.objects.create(
            type_name='General Waste',
            is_recyclable=False,
        )
        self.client.force_authenticate(user=self.resident_user)

    def test_schedule_accepts_collector_serving_the_same_county(self):
        response = self.client.post(
            '/api/auth/collections/',
            data={
                'waste_type': self.waste_type.id,
                'collector': self.kisumu_collector.user.id,
                'scheduled_date': '2026-03-25',
                'scheduled_time': '09:00',
                'status': 'pending',
                'address': 'Kisiani',
                'instructions': 'Please call on arrival.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload['collector_name'], 'Kisumu Green Collectors')
        self.assertEqual(payload['address'], 'Kisiani')

    def test_schedule_rejects_collector_from_a_different_county(self):
        response = self.client.post(
            '/api/auth/collections/',
            data={
                'waste_type': self.waste_type.id,
                'collector': self.nairobi_collector.user.id,
                'scheduled_date': '2026-03-25',
                'scheduled_time': '09:00',
                'status': 'pending',
                'address': 'Kisiani',
                'instructions': 'Please call on arrival.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('collector', response.json())


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    DEBUG=True,
    BREVO_API_KEY='re_test_api_key',
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='M-Taka No-Reply <sender@example.com>',
    PASSWORD_RESET_TIMEOUT=3600,
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class BrevoEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        if hasattr(mail, 'outbox'):
            mail.outbox.clear()

    def _mock_brevo_success(self, mock_urlopen, sender_active=True):
        def side_effect(request, timeout=20):
            response = MagicMock()
            if request.full_url.endswith('/v3/account'):
                response.read.return_value = json.dumps({
                    'email': 'owner@example.com',
                }).encode('utf-8')
            elif request.full_url.endswith('/v3/senders'):
                response.read.return_value = json.dumps({
                    'senders': [
                        {
                            'id': 101,
                            'name': 'M-Taka No-Reply',
                            'email': 'sender@example.com',
                            'active': sender_active,
                        }
                    ]
                }).encode('utf-8')
            else:
                response.read.return_value = json.dumps({'messageId': 'test'}).encode('utf-8')
            context_manager = MagicMock()
            context_manager.__enter__.return_value = response
            context_manager.__exit__.return_value = False
            return context_manager

        mock_urlopen.side_effect = side_effect

    @patch('core.auth_email.urlopen')
    def test_registration_uses_brevo_api_for_welcome_email(self, mock_urlopen):
        self._mock_brevo_success(mock_urlopen, sender_active=True)

        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'email': 'brevo-resident@example.com',
                'password': 'StrongPass!1',
                'password2': 'StrongPass!1',
                'user_type': 'household',
                'phone': '+254700009001',
                'full_name': 'Brevo Resident',
                'location': 'Westlands, Nairobi',
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(mock_urlopen.call_count, 3)

        request = mock_urlopen.call_args[0][0]
        payload = json.loads(request.data.decode('utf-8'))
        self.assertEqual(payload['sender']['email'], 'sender@example.com')
        self.assertEqual(payload['to'][0]['email'], 'brevo-resident@example.com')
        self.assertEqual(payload['subject'], 'Welcome to M-Taka')

    def test_email_status_reports_brevo_configuration(self):
        with patch('core.auth_email.urlopen') as mock_urlopen:
            self._mock_brevo_success(mock_urlopen, sender_active=True)
            response = self.client.get('/api/auth/email-status/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['provider'], 'brevo')
        self.assertTrue(payload['configured'])
        self.assertTrue(payload['api_key_valid'])
        self.assertEqual(payload['sender_email'], 'sender@example.com')
        self.assertEqual(payload['sender_id'], 101)
        self.assertTrue(payload['frontend_url_configured'])
        self.assertTrue(payload['sender_found'])
        self.assertTrue(payload['sender_active'])

    @patch('core.auth_email.urlopen')
    def test_password_reset_request_uses_brevo_api(self, mock_urlopen):
        self._mock_brevo_success(mock_urlopen, sender_active=True)

        user = self.user_model.objects.create_user(
            username='brevo-reset-user',
            email='brevo-reset@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009002',
        )

        response = self.client.post(
            '/api/auth/password-reset/request/',
            data={'email': user.email},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(mock_urlopen.call_count, 3)

        request = mock_urlopen.call_args[0][0]
        payload = json.loads(request.data.decode('utf-8'))
        self.assertEqual(payload['sender']['email'], 'sender@example.com')
        self.assertEqual(payload['to'][0]['email'], user.email)
        self.assertEqual(payload['subject'], 'Reset your M-Taka password')
        self.assertIn('uid=', payload['textContent'])
        self.assertIn('token=', payload['textContent'])


@override_settings(ALLOWED_HOSTS=['testserver'])
class IllegalDumpingMediaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.user = self.user_model.objects.create_user(
            username='dumping-reporter',
            email='dumping-reporter@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009100',
        )
        self.client.force_authenticate(user=self.user)

    def test_dumping_report_photo_is_returned_and_served(self):
        buffer = BytesIO()
        Image.new('RGB', (1, 1), color='red').save(buffer, format='PNG')
        photo = SimpleUploadedFile(
            'dumping.png',
            buffer.getvalue(),
            content_type='image/png',
        )

        with TemporaryDirectory(ignore_cleanup_errors=True) as media_root, override_settings(MEDIA_ROOT=media_root):
            create_response = self.client.post(
                '/api/auth/dumping-reports/',
                data={
                    'location': 'Westlands, Nairobi',
                    'description': 'Illegal dumping near the road.',
                    'severity': 'medium',
                    'photo': photo,
                },
                format='multipart',
            )

            self.assertEqual(create_response.status_code, 201)
            payload = create_response.json()
            self.assertIn('photo_url', payload)
            self.assertTrue(payload['photo_url'].startswith('http://testserver/media/dumping_reports/'))

            media_response = self.client.get(urlsplit(payload['photo_url']).path)
            media_file = getattr(media_response, 'file_to_stream', None)
            try:
                self.assertEqual(media_response.status_code, 200)
                self.assertEqual(media_response['Content-Type'], 'image/png')
            finally:
                if hasattr(media_file, 'close'):
                    media_file.close()


@override_settings(ALLOWED_HOSTS=['testserver'], FRONTEND_URL='https://mtaka.example')
class CollectorRouteSummaryTests(TestCase):
    class MockMapResponse:
        def __init__(self, payload):
            self.payload = payload

        def read(self):
            return json.dumps(self.payload).encode('utf-8')

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.user_model = get_user_model()

        self.collector_user = self.user_model.objects.create_user(
            username='collector-route-user',
            email='collector-route@example.com',
            password='StrongPass!1',
            user_type='collector',
            phone='+254700009200',
        )
        self.collector = Collector.objects.create(
            user=self.collector_user,
            company_name='Clean Connect',
            service_areas='Westlands, Nairobi',
        )

        self.household_waste_type = WasteType.objects.create(type_name='General Waste')

        resident_one = self.user_model.objects.create_user(
            username='resident-route-one',
            email='resident-route-one@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009201',
        )
        household_one = Household.objects.create(
            user=resident_one,
            full_name='Resident One',
            address='Westlands, Nairobi',
        )

        resident_two = self.user_model.objects.create_user(
            username='resident-route-two',
            email='resident-route-two@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='+254700009202',
        )
        household_two = Household.objects.create(
            user=resident_two,
            full_name='Resident Two',
            address='Parklands, Nairobi',
        )

        self.request_one = CollectionRequest.objects.create(
            household=household_one,
            waste_type=self.household_waste_type,
            collector=self.collector,
            scheduled_date=date(2026, 3, 22),
            scheduled_time=time(9, 0),
            status='scheduled',
            address='Westlands, Nairobi',
            address_lat=-1.2635,
            address_long=36.8020,
        )
        self.request_two = CollectionRequest.objects.create(
            household=household_two,
            waste_type=self.household_waste_type,
            collector=self.collector,
            scheduled_date=date(2026, 3, 22),
            scheduled_time=time(10, 0),
            status='scheduled',
            address='Parklands, Nairobi',
            address_lat=-1.2580,
            address_long=36.8180,
        )

        self.client.force_authenticate(user=self.collector_user)

    def _mock_map_urlopen(self, request, timeout=15):
        url = request.full_url if hasattr(request, 'full_url') else str(request)
        if '/table/v1/driving/' in url:
            return self.MockMapResponse({
                'code': 'Ok',
                'durations': [
                    [0, 540, 120],
                    [540, 0, 420],
                    [120, 420, 0],
                ],
            })
        if '/route/v1/driving/' in url:
            return self.MockMapResponse({
                'code': 'Ok',
                'routes': [
                    {
                        'distance': 12345,
                        'duration': 1800,
                        'legs': [
                            {'distance': 3500, 'duration': 600},
                            {'distance': 8845, 'duration': 1200},
                        ],
                    }
                ],
                'waypoints': [
                    {'location': [36.817223, -1.286389]},
                    {'location': [36.8180, -1.2580]},
                    {'location': [36.8020, -1.2635]},
                ],
            })
        if '/search?' in url:
            if 'Kisumu' in url:
                return self.MockMapResponse([
                    {
                        'lat': '-0.091702',
                        'lon': '34.767956',
                        'display_name': 'Kisumu, Kenya',
                    }
                ])
            if 'Westlands' in url:
                return self.MockMapResponse([
                    {
                        'lat': '-1.2635',
                        'lon': '36.8020',
                        'display_name': 'Westlands, Nairobi',
                    }
                ])
        raise AssertionError(f'Unexpected map request: {url}')

    def test_collector_route_summary_uses_road_order_and_metrics(self):
        with patch('core.route_planner.urlopen', side_effect=self._mock_map_urlopen):
            response = self.client.get(
                '/api/auth/collections/route-summary/',
                data={
                    'origin_location': 'Collector Base',
                    'origin_lat': -1.286389,
                    'origin_lng': 36.817223,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['provider'], 'osrm')
        self.assertTrue(payload['configured'])
        self.assertFalse(payload['fallback_used'])
        self.assertEqual(payload['origin']['label'], 'Collector Base')
        self.assertEqual(payload['total_stops'], 2)
        self.assertEqual(payload['estimated_time_min'], 50)
        self.assertEqual([stop['request_id'] for stop in payload['route']], [self.request_two.id, self.request_one.id])
        self.assertEqual(payload['route'][0]['eta_minutes'], 10)
        self.assertEqual(payload['route'][1]['eta_minutes'], 40)
        self.assertAlmostEqual(float(payload['total_distance_km']), 12.35, places=2)

    def test_collector_route_summary_geocodes_text_locations(self):
        cache.clear()
        self.request_one.address_lat = None
        self.request_one.address_long = None
        self.request_one.save(update_fields=['address_lat', 'address_long'])

        with patch('core.route_planner.urlopen', side_effect=self._mock_map_urlopen):
            response = self.client.get(
                '/api/auth/collections/route-summary/',
                data={
                    'origin_location': 'Kisumu',
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['origin']['label'], 'Kisumu, Kenya')
        westlands_stop = next(
            stop for stop in payload['route'] if stop['location'] == 'Westlands, Nairobi'
        )
        self.assertEqual(westlands_stop['coordinates']['lat'], -1.2635)
        self.assertEqual(westlands_stop['coordinates']['lng'], 36.8020)


@override_settings(
    ALLOWED_HOSTS=['testserver'],
    MPESA_ENV='sandbox',
    MPESA_CONSUMER_KEY='test-key',
    MPESA_CONSUMER_SECRET='test-secret',
    MPESA_BUSINESS_SHORTCODE='174379',
    MPESA_PASSKEY='test-passkey',
    MPESA_TRANSACTION_TYPE='CustomerPayBillOnline',
)
class MpesaPickupFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        cache.clear()

        self.waste_type = WasteType.objects.create(type_name='General Waste')

        self.collector_user = self.user_model.objects.create_user(
            username='collector-mpesa',
            email='collector-mpesa@example.com',
            password='StrongPass!1',
            user_type='collector',
            phone='+254700010001',
        )
        self.collector = Collector.objects.create(
            user=self.collector_user,
            company_name='Collector Flow Ltd',
            service_areas='Westlands, Nairobi',
        )

        self.household_user = self.user_model.objects.create_user(
            username='resident-mpesa',
            email='resident-mpesa@example.com',
            password='StrongPass!1',
            user_type='household',
            phone='0712345678',
        )
        self.household = Household.objects.create(
            user=self.household_user,
            full_name='Resident Mpesa',
            address='Westlands, Nairobi',
        )

        self.collection_request = CollectionRequest.objects.create(
            household=self.household,
            waste_type=self.waste_type,
            collector=self.collector,
            scheduled_date=date(2026, 4, 2),
            scheduled_time=time(9, 30),
            status='scheduled',
            address='Westlands, Nairobi',
        )

        self.recycler_user = self.user_model.objects.create_user(
            username='recycler-mpesa',
            email='recycler-mpesa@example.com',
            password='StrongPass!1',
            user_type='recycler',
            phone='+254700010002',
        )
        self.listing = RecyclableListing.objects.create(
            resident=self.household_user,
            resident_name='Resident Mpesa',
            resident_phone='0722000111',
            resident_location='Westlands, Nairobi',
            material_type='plastic',
            estimated_weight=Decimal('12.50'),
            description='Sorted plastics',
            preferred_date=date(2026, 4, 3),
            preferred_time=time(11, 0),
            status='scheduled',
            recycler=self.recycler_user,
            recycler_name='Recycler Flow Ltd',
            scheduled_date=date(2026, 4, 3),
            scheduled_time=time(11, 0),
            offered_price=Decimal('625.00'),
        )

    @staticmethod
    def _successful_stk_response(phone_number='254712345678', amount=850):
        return {
            'request_payload': {
                'PhoneNumber': phone_number,
                'Amount': amount,
            },
            'response_payload': {
                'MerchantRequestID': '29115-34620561-1',
                'CheckoutRequestID': 'ws_CO_123456789',
                'ResponseCode': '0',
                'ResponseDescription': 'Success. Request accepted for processing',
                'CustomerMessage': 'Success. Request accepted for processing',
            },
            'normalized_phone': phone_number,
            'normalized_amount': amount,
        }

    @staticmethod
    def _callback_payload(*, checkout_request_id, merchant_request_id, receipt_number, amount, phone_number):
        return {
            'Body': {
                'stkCallback': {
                    'MerchantRequestID': merchant_request_id,
                    'CheckoutRequestID': checkout_request_id,
                    'ResultCode': 0,
                    'ResultDesc': 'The service request is processed successfully.',
                    'CallbackMetadata': {
                        'Item': [
                            {'Name': 'Amount', 'Value': amount},
                            {'Name': 'MpesaReceiptNumber', 'Value': receipt_number},
                            {'Name': 'TransactionDate', 'Value': 20260328193015},
                            {'Name': 'PhoneNumber', 'Value': phone_number},
                        ]
                    },
                }
            }
        }

    @patch('core.views.initiate_stk_push')
    def test_collector_stk_push_defaults_to_household_phone(self, mock_initiate_stk_push):
        mock_initiate_stk_push.return_value = self._successful_stk_response(
            phone_number='254712345678',
            amount=850,
        )
        self.client.force_authenticate(user=self.collector_user)

        response = self.client.post(
            '/api/auth/collector-transactions/mpesa/stk-push/',
            data={
                'collection_request': self.collection_request.id,
                'total_weight': '42.5',
                'total_price': '850',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload['status'], 'pending')
        self.assertEqual(payload['paymentScope'], 'collector_pickup')
        self.assertEqual(payload['phoneNumber'], '254712345678')
        self.assertEqual(payload['amount'], '850.00')

        payment = MpesaPayment.objects.get(id=payload['id'])
        self.assertEqual(payment.phone_number, '254712345678')
        self.assertEqual(payment.collection_request_id, self.collection_request.id)
        self.assertEqual(payment.recorded_weight, Decimal('42.5'))

        mock_initiate_stk_push.assert_called_once()
        self.assertEqual(mock_initiate_stk_push.call_args.kwargs['phone_number'], '0712345678')

    def test_collector_callback_success_creates_transaction_and_completes_request(self):
        payment = MpesaPayment.objects.create(
            initiated_by=self.collector_user,
            payment_scope='collector_pickup',
            collection_request=self.collection_request,
            amount=Decimal('900.00'),
            recorded_weight=Decimal('50.00'),
            phone_number='254712345678',
            merchant_request_id='29115-34620561-1',
            checkout_request_id='ws_CO_987654321',
            status='pending',
        )

        response = self.client.post(
            '/api/auth/mpesa/callback/',
            data=self._callback_payload(
                checkout_request_id='ws_CO_987654321',
                merchant_request_id='29115-34620561-1',
                receipt_number='TJH123ABC9',
                amount=900,
                phone_number=254712345678,
            ),
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.collection_request.refresh_from_db()

        self.assertEqual(payment.status, 'success')
        self.assertEqual(payment.mpesa_receipt_number, 'TJH123ABC9')
        self.assertEqual(self.collection_request.status, 'completed')
        self.assertTrue(CollectorTransaction.objects.filter(collection_request=self.collection_request).exists())

        transaction = CollectorTransaction.objects.get(collection_request=self.collection_request)
        self.assertEqual(transaction.payment_method, 'mpesa')
        self.assertEqual(transaction.mpesa_code, 'TJH123ABC9')
        self.assertEqual(transaction.total_weight, Decimal('50.00'))
        self.assertEqual(transaction.total_price, Decimal('900.00'))

    def test_recycler_callback_success_creates_transaction_and_completes_listing(self):
        payment = MpesaPayment.objects.create(
            initiated_by=self.recycler_user,
            payment_scope='recycler_pickup',
            recyclable_listing=self.listing,
            amount=Decimal('625.00'),
            recorded_weight=Decimal('13.00'),
            phone_number='254722000111',
            merchant_request_id='29115-34620561-2',
            checkout_request_id='ws_CO_222333444',
            status='pending',
            completion_notes='Pickup paid successfully',
        )

        response = self.client.post(
            '/api/auth/mpesa/callback/',
            data=self._callback_payload(
                checkout_request_id='ws_CO_222333444',
                merchant_request_id='29115-34620561-2',
                receipt_number='TJH555XYZ1',
                amount=625,
                phone_number=254722000111,
            ),
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.listing.refresh_from_db()

        self.assertEqual(payment.status, 'success')
        self.assertEqual(payment.mpesa_receipt_number, 'TJH555XYZ1')
        self.assertEqual(self.listing.status, 'completed')
        self.assertEqual(self.listing.actual_weight, Decimal('13.00'))
        self.assertEqual(self.listing.completion_notes, 'Pickup paid successfully')
        self.assertTrue(RecyclerTransaction.objects.filter(listing=self.listing).exists())

        transaction = RecyclerTransaction.objects.get(listing=self.listing)
        self.assertEqual(transaction.payment_method, 'mpesa')
        self.assertEqual(transaction.mpesa_code, 'TJH555XYZ1')
        self.assertEqual(transaction.price, Decimal('625.00'))

    def test_successful_payment_notes_can_be_saved_after_payment(self):
        self.client.force_authenticate(user=self.collector_user)
        self.collection_request.status = 'completed'
        self.collection_request.instructions = 'CompletedAt: 2026-03-29T10:00:00+03:00'
        self.collection_request.save(update_fields=['status', 'instructions'])

        payment = MpesaPayment.objects.create(
            initiated_by=self.collector_user,
            payment_scope='collector_pickup',
            collection_request=self.collection_request,
            amount=Decimal('900.00'),
            recorded_weight=Decimal('50.00'),
            phone_number='254712345678',
            status='success',
            mpesa_receipt_number='TJH777FIN',
        )

        response = self.client.post(
            f'/api/auth/mpesa-payments/{payment.id}/save-notes/',
            data={'completion_notes': 'Resident paid and bags were weighed on site.'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payment.refresh_from_db()
        self.collection_request.refresh_from_db()
        self.assertEqual(payment.completion_notes, 'Resident paid and bags were weighed on site.')
        self.assertIn('Completion: Resident paid and bags were weighed on site.', self.collection_request.instructions)
        self.assertIn('CompletedAt: 2026-03-29T10:00:00+03:00', self.collection_request.instructions)

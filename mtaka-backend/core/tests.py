import json
import re
from io import BytesIO
from datetime import date, time
from urllib.parse import urlsplit
from unittest.mock import MagicMock, patch

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from PIL import Image

from .county import location_matches_county, resolve_county_from_location
from .models import CollectionRequest, CollectionRequestUpdate, Collector, Household, WasteType


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


class CountyResolutionTests(TestCase):
    def test_common_locations_map_to_the_expected_county(self):
        self.assertEqual(resolve_county_from_location('Kisiani'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Maseno, Kisumu County'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Kisumu East'), 'Kisumu')
        self.assertEqual(resolve_county_from_location('Karen'), 'Nairobi')
        self.assertTrue(location_matches_county('Kisiani', 'Kisumu'))
        self.assertTrue(location_matches_county('Maseno, Kisumu County', 'Kisumu'))
        self.assertFalse(location_matches_county('Kisiani', 'Nairobi'))

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
        self.assertEqual(media_response.status_code, 200)
        self.assertEqual(media_response['Content-Type'], 'image/png')


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

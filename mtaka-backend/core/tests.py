import json
import re
from unittest.mock import MagicMock, patch

from django.core import mail
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

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
            if request.full_url.endswith('/v3/senders'):
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
        self.assertEqual(mock_urlopen.call_count, 2)

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
        self.assertEqual(payload['sender_email'], 'sender@example.com')
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
        self.assertEqual(mock_urlopen.call_count, 2)

        request = mock_urlopen.call_args[0][0]
        payload = json.loads(request.data.decode('utf-8'))
        self.assertEqual(payload['sender']['email'], 'sender@example.com')
        self.assertEqual(payload['to'][0]['email'], user.email)
        self.assertEqual(payload['subject'], 'Reset your M-Taka password')
        self.assertIn('uid=', payload['textContent'])
        self.assertIn('token=', payload['textContent'])

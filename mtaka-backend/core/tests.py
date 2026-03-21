import json

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Household


@override_settings(
    RUNTIME_SESSION_ID='test-session-id',
    SIMPLE_JWT={
        'ACCESS_TOKEN_LIFETIME': __import__('datetime').timedelta(minutes=60),
        'REFRESH_TOKEN_LIFETIME': __import__('datetime').timedelta(days=1),
        'AUTH_HEADER_TYPES': ('Bearer',),
    },
)
class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

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

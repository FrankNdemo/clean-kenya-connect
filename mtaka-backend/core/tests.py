import json

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import CollectionRequest, CollectionRequestUpdate, Collector, Household, WasteType


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

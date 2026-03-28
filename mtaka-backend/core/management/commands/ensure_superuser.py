import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import Authority


DEFAULT_SUPERUSER_USERNAME = 'ndemo frank'
DEFAULT_SUPERUSER_EMAIL = 'linkentnerg@gmail.com'
DEFAULT_SUPERUSER_PASSWORD = 'Ombogo1234.'
DEFAULT_SUPERUSER_PHONE = '+254768241871'
DEFAULT_SUPERUSER_FIRST_NAME = 'ndemo'
DEFAULT_SUPERUSER_LAST_NAME = 'frank'


class Command(BaseCommand):
    help = 'Ensure the seeded admin user exists with the expected credentials.'

    def handle(self, *args, **options):
        User = get_user_model()

        username = os.getenv('DJANGO_SUPERUSER_USERNAME', DEFAULT_SUPERUSER_USERNAME).strip()
        email = os.getenv('DJANGO_SUPERUSER_EMAIL', DEFAULT_SUPERUSER_EMAIL).strip().lower()
        password = os.getenv('DJANGO_SUPERUSER_PASSWORD', DEFAULT_SUPERUSER_PASSWORD)
        phone = os.getenv('DJANGO_SUPERUSER_PHONE', DEFAULT_SUPERUSER_PHONE).strip()
        first_name = os.getenv('DJANGO_SUPERUSER_FIRST_NAME', DEFAULT_SUPERUSER_FIRST_NAME).strip()
        last_name = os.getenv('DJANGO_SUPERUSER_LAST_NAME', DEFAULT_SUPERUSER_LAST_NAME).strip()
        user_type = os.getenv('DJANGO_SUPERUSER_USER_TYPE', 'authority').strip() or 'authority'

        if not password:
            self.stderr.write(self.style.ERROR('DJANGO_SUPERUSER_PASSWORD is empty.'))
            return

        user = User.objects.filter(username=username).first()
        created = False
        if user is None:
            user = User(username=username)
            created = True

        changed_fields = []
        for field, value in (
            ('email', email),
            ('phone', phone),
            ('first_name', first_name),
            ('last_name', last_name),
            ('user_type', user_type),
        ):
            if getattr(user, field) != value:
                setattr(user, field, value)
                changed_fields.append(field)

        if not user.is_staff:
            user.is_staff = True
            changed_fields.append('is_staff')
        if not user.is_superuser:
            user.is_superuser = True
            changed_fields.append('is_superuser')
        if not user.is_active:
            user.is_active = True
            changed_fields.append('is_active')

        if created or not user.check_password(password):
            user.set_password(password)
            changed_fields.append('password')

        if created:
            user.save()
        elif changed_fields:
            user.save(update_fields=sorted(set(changed_fields)))

        authority_defaults = {
            'staff_name': f'{first_name} {last_name}'.strip() or username,
            'county': '',
            'department': None,
            'staff_id': None,
        }
        authority, authority_created = Authority.objects.get_or_create(
            user=user,
            defaults=authority_defaults,
        )
        if not authority_created:
            authority_changes = []
            for field, value in authority_defaults.items():
                if getattr(authority, field) != value:
                    setattr(authority, field, value)
                    authority_changes.append(field)
            if authority_changes:
                authority.save(update_fields=authority_changes)

        status = 'created' if created else 'updated'
        self.stdout.write(self.style.SUCCESS(
            f'Seeded superuser {status}: username={username!r}, email={email!r}'
        ))

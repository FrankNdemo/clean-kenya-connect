from django.db import migrations


SUPERUSER_USERNAME = 'ndemo frank'
SUPERUSER_EMAIL = 'linkentnerg@gmail.com'
SUPERUSER_PASSWORD = 'Ombogo1234.'
SUPERUSER_PHONE = '+254768241871'
SUPERUSER_FIRST_NAME = 'ndemo'
SUPERUSER_LAST_NAME = 'frank'


def seed_superuser(apps, schema_editor):
    User = apps.get_model('core', 'User')
    Authority = apps.get_model('core', 'Authority')

    db_alias = schema_editor.connection.alias

    existing_user = User.objects.using(db_alias).filter(username=SUPERUSER_USERNAME).first()
    if existing_user:
        existing_user.delete()

    user = User.objects.db_manager(db_alias).create_superuser(
        username=SUPERUSER_USERNAME,
        email=SUPERUSER_EMAIL,
        password=SUPERUSER_PASSWORD,
        user_type='authority',
        phone=SUPERUSER_PHONE,
        first_name=SUPERUSER_FIRST_NAME,
        last_name=SUPERUSER_LAST_NAME,
    )

    Authority.objects.db_manager(db_alias).create(
        user=user,
        staff_name=f'{SUPERUSER_FIRST_NAME} {SUPERUSER_LAST_NAME}',
        county='',
        department=None,
        staff_id=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_event_cover_image_data'),
    ]

    operations = [
        migrations.RunPython(seed_superuser, migrations.RunPython.noop),
    ]

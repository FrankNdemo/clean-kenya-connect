# Supabase Database Setup (Django Backend)

## 1) Create env file

Copy `.env.example` to `.env` and fill your Supabase credentials:

- `DATABASE_URL` (recommended), or
- `SUPABASE_DB_*` variables.
- Set `DB_ENGINE=postgresql` when using `SUPABASE_DB_*` fields.

Use Supabase Postgres connection string with SSL (`sslmode=require`).

## 2) Install Python deps (if needed)

Ensure PostgreSQL driver is available:

```bash
pip install psycopg2-binary
```

## 3) Run migrations on Supabase

```bash
python manage.py migrate
```

## 4) Start backend

```bash
python manage.py runserver
```

All existing API endpoints (`/api/auth/...`) will now read/write from Supabase.

## Optional: move existing local MySQL data

1. Export local DB from MySQL.
2. Import to Supabase Postgres.
3. Re-run `python manage.py migrate` to align schema.

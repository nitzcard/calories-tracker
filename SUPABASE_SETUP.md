# Supabase Setup (Username-Only Cloud Sync)

This app can optionally sync your local IndexedDB data to Supabase using a single JSON blob per username.

Important: this is **username-only** sync with **no authentication**. Anyone who knows your username can read and overwrite the cloud copy.

## 1. Create a Supabase project

Create a new project in Supabase and copy:

- Project URL
- `anon` public key

Put them into `.env`:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
```

Restart `npm run dev` after editing env vars.

## 2. Create the table

Run this SQL in the Supabase SQL editor:

```sql
create table if not exists public.user_blobs (
  username text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
```

## 3. Allow public read/write (required for username-only)

Enable RLS and allow the `anon` role to read/write any row:

```sql
alter table public.user_blobs enable row level security;

drop policy if exists "public read" on public.user_blobs;
create policy "public read"
on public.user_blobs
for select
using (true);

drop policy if exists "public write" on public.user_blobs;
create policy "public write"
on public.user_blobs
for insert
with check (true);

drop policy if exists "public update" on public.user_blobs;
create policy "public update"
on public.user_blobs
for update
using (true)
with check (true);
```

That is intentionally permissive to match the “username only” requirement.


alter table public.branches
add column if not exists business_registration_number text,
add column if not exists business_type text,
add column if not exists representative_name text,
add column if not exists email text;

create unique index if not exists branches_business_registration_number_idx
on public.branches (business_registration_number)
where business_registration_number is not null and business_registration_number <> '';

create table if not exists public.supplier_directory (
  id uuid primary key default gen_random_uuid(),
  business_registration_number text unique,
  name text not null unique,
  representative_name text,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.supplier_directory (
  name,
  is_active
)
select distinct
  btrim(supplier_name),
  true
from public.products
where nullif(btrim(supplier_name), '') is not null
on conflict (name) do nothing;

alter table public.supplier_directory enable row level security;

drop policy if exists "admins can manage supplier_directory"
on public.supplier_directory;

create policy "admins can manage supplier_directory"
on public.supplier_directory
for all
using (public.is_admin())
with check (public.is_admin());

create extension if not exists "pgcrypto";

create type order_status as enum ('draft', 'submitted', 'closed');
create type closing_status as enum ('closed', 'cancelled');
create type admin_role as enum ('admin');

create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  delivery_address text not null,
  recipient_name text not null,
  phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  product_code text not null,
  name text not null,
  spec text not null default '',
  supplier_name text not null,
  unit_price numeric(12, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  order_date date not null,
  status order_status not null default 'draft',
  submitted_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, order_date)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  barcode text not null,
  product_code text,
  product_name text not null,
  spec text not null default '',
  supplier_name text,
  quantity integer not null check (quantity >= 0),
  is_unregistered boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  role admin_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table closing_batches (
  id uuid primary key default gen_random_uuid(),
  order_date date not null unique,
  status closing_status not null default 'closed',
  closed_by uuid references admin_users(id),
  closed_at timestamptz not null default now(),
  cancelled_by uuid references admin_users(id),
  cancelled_at timestamptz,
  note text
);

create table generated_files (
  id uuid primary key default gen_random_uuid(),
  closing_batch_id uuid not null references closing_batches(id) on delete cascade,
  supplier_name text not null,
  file_name text not null,
  storage_path text,
  generated_at timestamptz not null default now()
);

create index orders_branch_id_idx on orders (branch_id);
create index orders_order_date_idx on orders (order_date);
create index order_items_order_id_idx on order_items (order_id);
create index order_items_product_id_idx on order_items (product_id);
create index closing_batches_order_date_idx on closing_batches (order_date);
create index generated_files_closing_batch_id_idx on generated_files (closing_batch_id);

alter table branches enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table closing_batches enable row level security;
alter table generated_files enable row level security;
alter table admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where auth_user_id = auth.uid()
      and role = 'admin'
  );
$$;

create policy "public read active branches"
on branches
for select
using (is_active = true);

create policy "public read active products"
on products
for select
using (is_active = true);

create policy "admins can manage branches"
on branches
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage products"
on products
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage orders"
on orders
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage order_items"
on order_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage closing_batches"
on closing_batches
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can manage generated_files"
on generated_files
for all
using (public.is_admin())
with check (public.is_admin());

create policy "admins can view own admin_users row"
on admin_users
for select
using (auth.uid() = auth_user_id);

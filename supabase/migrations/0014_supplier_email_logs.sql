create table if not exists public.supplier_email_logs (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  supplier_name text not null,
  email text,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  reason text,
  provider_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists supplier_email_logs_order_date_idx
on public.supplier_email_logs (order_date, created_at desc);

alter table public.supplier_email_logs enable row level security;

drop policy if exists "admins can read supplier_email_logs"
on public.supplier_email_logs;

create policy "admins can read supplier_email_logs"
on public.supplier_email_logs
for select
using (public.is_admin());

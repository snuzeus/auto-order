create table if not exists public.closing_settings (
  id boolean primary key default true,
  mode text not null default 'manual' check (mode in ('manual', 'auto_14')),
  auto_close_time time not null default time '14:00',
  timezone text not null default 'Asia/Seoul',
  updated_by uuid references public.admin_users(id),
  updated_at timestamptz not null default now(),
  constraint closing_settings_singleton check (id = true)
);

insert into public.closing_settings (
  id,
  mode,
  auto_close_time,
  timezone
) values (
  true,
  'manual',
  time '14:00',
  'Asia/Seoul'
)
on conflict (id) do nothing;

alter table public.closing_settings enable row level security;

drop policy if exists "admins can manage closing_settings"
on public.closing_settings;

create policy "admins can manage closing_settings"
on public.closing_settings
for all
using (public.is_admin())
with check (public.is_admin());

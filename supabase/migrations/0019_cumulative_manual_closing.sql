alter table public.orders
add column if not exists closing_batch_id uuid
references public.closing_batches(id) on delete set null;

alter table public.supplier_email_logs
add column if not exists closing_batch_id uuid
references public.closing_batches(id) on delete cascade;

create index if not exists orders_closing_batch_id_idx
on public.orders (closing_batch_id);

create index if not exists supplier_email_logs_closing_batch_id_idx
on public.supplier_email_logs (closing_batch_id, created_at desc);

update public.orders
set closing_batch_id = public.closing_batches.id
from public.closing_batches
where public.orders.closing_batch_id is null
  and public.orders.status = 'closed'
  and public.closing_batches.order_date = public.orders.order_date
  and public.closing_batches.status = 'closed';

with matched_email_logs as (
  select
    public.supplier_email_logs.id as email_log_id,
    (
      select public.closing_batches.id
      from public.closing_batches
      where public.closing_batches.order_date = public.supplier_email_logs.order_date
        and public.closing_batches.closed_at <= public.supplier_email_logs.created_at
        and (
          public.closing_batches.cancelled_at is null
          or public.supplier_email_logs.created_at <= public.closing_batches.cancelled_at
        )
      order by public.closing_batches.closed_at desc
      limit 1
    ) as closing_batch_id
  from public.supplier_email_logs
  where public.supplier_email_logs.closing_batch_id is null
)
update public.supplier_email_logs
set closing_batch_id = matched_email_logs.closing_batch_id
from matched_email_logs
where public.supplier_email_logs.id = matched_email_logs.email_log_id
  and matched_email_logs.closing_batch_id is not null;

create or replace function public.close_orders_for_date(
  p_order_date date,
  p_admin_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_closing_batch_id uuid;
begin
  perform public.lock_order_date(p_order_date);

  if exists (
    select 1
    from public.closing_batches
    where public.closing_batches.order_date = p_order_date
      and public.closing_batches.status = 'closed'
  ) then
    raise exception '이미 마감된 날짜입니다.';
  end if;

  if exists (
    select 1
    from public.orders
    join public.order_items on public.order_items.order_id = public.orders.id
    where public.orders.order_date = p_order_date
      and public.orders.status = 'submitted'
      and public.order_items.quantity > 0
      and nullif(btrim(coalesce(public.order_items.supplier_name, '')), '') is null
  ) then
    raise exception '공급처가 비어 있는 상품이 있어 마감할 수 없습니다.';
  end if;

  insert into public.closing_batches (order_date, status, closed_by, closed_at)
  values (p_order_date, 'closed', p_admin_id, v_now)
  returning id into v_closing_batch_id;

  update public.orders
  set status = 'closed',
      closed_at = v_now,
      updated_at = v_now,
      closing_batch_id = v_closing_batch_id
  where public.orders.order_date = p_order_date
    and public.orders.status = 'submitted';

  if not found then
    raise exception '마감할 제출 주문이 없습니다.';
  end if;

  return v_closing_batch_id;
end;
$$;

create or replace function public.close_orders_through_date(
  p_order_date date,
  p_admin_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_closing_batch_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('auto_order_cumulative_close'));
  perform public.lock_order_date(p_order_date);

  if exists (
    select 1
    from public.closing_batches
    where public.closing_batches.order_date = p_order_date
      and public.closing_batches.status = 'closed'
  ) then
    raise exception '이미 마감된 날짜입니다.';
  end if;

  if exists (
    select 1
    from public.orders
    join public.order_items on public.order_items.order_id = public.orders.id
    where public.orders.order_date <= p_order_date
      and public.orders.status = 'submitted'
      and public.order_items.quantity > 0
      and nullif(btrim(coalesce(public.order_items.supplier_name, '')), '') is null
  ) then
    raise exception '공급처가 비어 있는 상품이 있어 마감할 수 없습니다.';
  end if;

  insert into public.closing_batches (order_date, status, closed_by, closed_at)
  values (p_order_date, 'closed', p_admin_id, v_now)
  returning id into v_closing_batch_id;

  update public.orders
  set status = 'closed',
      closed_at = v_now,
      updated_at = v_now,
      closing_batch_id = v_closing_batch_id
  where public.orders.order_date <= p_order_date
    and public.orders.status = 'submitted';

  if not found then
    raise exception '마감할 누적 제출 주문이 없습니다.';
  end if;

  return v_closing_batch_id;
end;
$$;

create or replace function public.cancel_closing_for_date(
  p_order_date date,
  p_admin_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_closing_batch_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('auto_order_cumulative_close'));
  perform public.lock_order_date(p_order_date);

  select public.closing_batches.id
  into v_closing_batch_id
  from public.closing_batches
  where public.closing_batches.order_date = p_order_date
    and public.closing_batches.status = 'closed'
  order by public.closing_batches.closed_at desc
  limit 1
  for update;

  if v_closing_batch_id is null then
    raise exception '취소할 마감 이력이 없습니다.';
  end if;

  update public.orders
  set status = 'submitted',
      closed_at = null,
      updated_at = v_now,
      closing_batch_id = null
  where public.orders.closing_batch_id = v_closing_batch_id
    and public.orders.status = 'closed';

  update public.closing_batches
  set status = 'cancelled',
      cancelled_by = p_admin_id,
      cancelled_at = v_now
  where public.closing_batches.id = v_closing_batch_id;

  return v_closing_batch_id;
end;
$$;

revoke execute on function public.close_orders_for_date(date, uuid)
from public, anon, authenticated;
grant execute on function public.close_orders_for_date(date, uuid)
to service_role;

revoke execute on function public.close_orders_through_date(date, uuid)
from public, anon, authenticated;
grant execute on function public.close_orders_through_date(date, uuid)
to service_role;

revoke execute on function public.cancel_closing_for_date(date, uuid)
from public, anon, authenticated;
grant execute on function public.cancel_closing_for_date(date, uuid)
to service_role;

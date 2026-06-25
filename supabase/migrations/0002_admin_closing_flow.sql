alter table public.closing_batches
drop constraint if exists closing_batches_order_date_key;

create unique index if not exists closing_batches_open_order_date_idx
on public.closing_batches (order_date)
where status = 'closed';

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
  if exists (
    select 1
    from public.closing_batches
    where order_date = p_order_date
      and status = 'closed'
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

  update public.orders
  set status = 'closed',
      closed_at = v_now,
      updated_at = v_now
  where order_date = p_order_date
    and status = 'submitted';

  if not found then
    raise exception '마감할 제출 주문이 없습니다.';
  end if;

  insert into public.closing_batches (
    order_date,
    status,
    closed_by,
    closed_at
  )
  values (
    p_order_date,
    'closed',
    p_admin_id,
    v_now
  )
  returning id
  into v_closing_batch_id;

  return v_closing_batch_id;
end;
$$;

revoke execute on function public.close_orders_for_date(date, uuid) from public, anon, authenticated;
grant execute on function public.close_orders_for_date(date, uuid) to service_role;

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
  select id
  into v_closing_batch_id
  from public.closing_batches
  where order_date = p_order_date
    and status = 'closed'
  order by closed_at desc
  limit 1
  for update;

  if v_closing_batch_id is null then
    raise exception '취소할 마감 이력이 없습니다.';
  end if;

  update public.orders
  set status = 'submitted',
      closed_at = null,
      updated_at = v_now
  where order_date = p_order_date
    and status = 'closed';

  update public.closing_batches
  set status = 'cancelled',
      cancelled_by = p_admin_id,
      cancelled_at = v_now
  where id = v_closing_batch_id;

  return v_closing_batch_id;
end;
$$;

revoke execute on function public.cancel_closing_for_date(date, uuid) from public, anon, authenticated;
grant execute on function public.cancel_closing_for_date(date, uuid) to service_role;

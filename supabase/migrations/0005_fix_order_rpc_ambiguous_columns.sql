create or replace function public.submit_branch_order(
  p_branch_id uuid,
  p_order_date date,
  p_items jsonb
)
returns table (
  order_id uuid,
  status order_status,
  branch_id uuid,
  order_date date
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_order public.orders%rowtype;
  v_now timestamptz := now();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using message = 'ORDER_ITEMS_INVALID';
  end if;

  if not exists (
    select 1
    from jsonb_to_recordset(p_items) as item(quantity integer)
    where coalesce(item.quantity, 0) > 0
  ) then
    raise exception using message = 'ORDER_ITEMS_EMPTY';
  end if;

  perform 1
  from public.branches
  where public.branches.id = p_branch_id
    and public.branches.is_active = true;

  if not found then
    raise exception using message = 'BRANCH_NOT_FOUND';
  end if;

  perform public.lock_order_date(p_order_date);

  if exists (
    select 1
    from public.closing_batches
    where public.closing_batches.order_date = p_order_date
      and public.closing_batches.status = 'closed'
  ) then
    raise exception using message = 'ORDER_DATE_CLOSED';
  end if;

  select *
  into v_order
  from public.orders
  where public.orders.branch_id = p_branch_id
    and public.orders.order_date = p_order_date
  for update;

  if found and v_order.status = 'closed' then
    raise exception using message = 'ORDER_DATE_CLOSED';
  end if;

  insert into public.orders (
    branch_id,
    order_date,
    status,
    submitted_at,
    updated_at
  )
  values (
    p_branch_id,
    p_order_date,
    'submitted',
    v_now,
    v_now
  )
  on conflict (branch_id, order_date)
  do update
  set status = 'submitted',
      submitted_at = excluded.submitted_at,
      updated_at = excluded.updated_at
  where public.orders.status <> 'closed'
  returning *
  into v_order;

  if v_order.id is null then
    raise exception using message = 'ORDER_DATE_CLOSED';
  end if;

  delete from public.order_items
  where public.order_items.order_id = v_order.id;

  insert into public.order_items (
    order_id,
    product_id,
    barcode,
    product_code,
    product_name,
    spec,
    supplier_name,
    quantity,
    is_unregistered,
    memo
  )
  select
    v_order.id,
    item.product_id,
    item.barcode,
    item.product_code,
    item.product_name,
    coalesce(item.spec, ''),
    item.supplier_name,
    item.quantity,
    coalesce(item.is_unregistered, false),
    item.memo
  from jsonb_to_recordset(p_items) as item(
    product_id uuid,
    barcode text,
    product_code text,
    product_name text,
    spec text,
    supplier_name text,
    quantity integer,
    is_unregistered boolean,
    memo text
  )
  where coalesce(item.quantity, 0) > 0;

  order_id := v_order.id;
  status := v_order.status;
  branch_id := v_order.branch_id;
  order_date := v_order.order_date;
  return next;
end;
$$;

grant execute on function public.submit_branch_order(uuid, date, jsonb)
to service_role;

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

  update public.orders
  set status = 'closed',
      closed_at = v_now,
      updated_at = v_now
  where public.orders.order_date = p_order_date
    and public.orders.status = 'submitted';

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

grant execute on function public.close_orders_for_date(date, uuid)
to service_role;

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
      updated_at = v_now
  where public.orders.order_date = p_order_date
    and public.orders.status = 'closed';

  update public.closing_batches
  set status = 'cancelled',
      cancelled_by = p_admin_id,
      cancelled_at = v_now
  where public.closing_batches.id = v_closing_batch_id;

  return v_closing_batch_id;
end;
$$;

grant execute on function public.cancel_closing_for_date(date, uuid)
to service_role;

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
  where id = p_branch_id
    and is_active = true;

  if not found then
    raise exception using message = 'BRANCH_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.closing_batches
    where order_date = p_order_date
      and status = 'closed'
  ) then
    raise exception using message = 'ORDER_DATE_CLOSED';
  end if;

  select *
  into v_order
  from public.orders
  where branch_id = p_branch_id
    and order_date = p_order_date
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
  where order_id = v_order.id;

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

  return query
  select
    v_order.id,
    v_order.status,
    v_order.branch_id,
    v_order.order_date;
end;
$$;

revoke execute on function public.submit_branch_order(uuid, date, jsonb)
from public, anon, authenticated;

grant execute on function public.submit_branch_order(uuid, date, jsonb)
to service_role;

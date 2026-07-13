alter table public.order_items
add column if not exists unit_price numeric(12, 2) not null default 0;

alter table public.order_items
add column if not exists minimum_order_quantity integer;

alter table public.order_items
drop constraint if exists order_items_minimum_order_quantity_check;

alter table public.order_items
add constraint order_items_minimum_order_quantity_check
check (
  minimum_order_quantity is null
  or minimum_order_quantity > 0
);

update public.order_items
set unit_price = public.products.unit_price,
    minimum_order_quantity = public.products.minimum_order_quantity
from public.products
where public.products.barcode = public.order_items.barcode;

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
    unit_price,
    minimum_order_quantity,
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
    coalesce(item.unit_price, snapshot.unit_price, 0),
    coalesce(item.minimum_order_quantity, snapshot.minimum_order_quantity),
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
    unit_price numeric,
    minimum_order_quantity integer,
    quantity integer,
    is_unregistered boolean,
    memo text
  )
  left join lateral (
    select
      public.products.unit_price,
      public.products.minimum_order_quantity
    from public.products
    where (
      item.product_id is not null
      and public.products.id = item.product_id
    )
    or public.products.barcode = item.barcode
    order by case
      when item.product_id is not null and public.products.id = item.product_id then 0
      else 1
    end
    limit 1
  ) as snapshot on true
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

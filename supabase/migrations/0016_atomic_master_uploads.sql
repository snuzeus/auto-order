create or replace function public.replace_product_master(
  p_products jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imported_count integer := 0;
begin
  if p_products is null or jsonb_typeof(p_products) <> 'array' then
    raise exception using message = 'PRODUCT_MASTER_INVALID';
  end if;

  if jsonb_array_length(p_products) = 0 then
    raise exception using message = 'PRODUCT_MASTER_EMPTY';
  end if;

  update public.products
  set is_active = false,
      updated_at = now()
  where id <> '00000000-0000-0000-0000-000000000000'::uuid
    and not exists (
      select 1
      from jsonb_to_recordset(p_products) as product(barcode text)
      where btrim(product.barcode) = public.products.barcode
    );

  insert into public.products (
    barcode,
    product_code,
    name,
    spec,
    supplier_name,
    unit_price,
    minimum_order_quantity,
    is_active,
    updated_at
  )
  select
    btrim(product.barcode),
    btrim(product.product_code),
    btrim(product.name),
    coalesce(product.spec, ''),
    btrim(product.supplier_name),
    product.unit_price,
    product.minimum_order_quantity,
    coalesce(product.is_active, true),
    now()
  from jsonb_to_recordset(p_products) as product(
    barcode text,
    product_code text,
    name text,
    spec text,
    supplier_name text,
    unit_price numeric,
    minimum_order_quantity integer,
    is_active boolean
  )
  on conflict (barcode) do update
  set product_code = excluded.product_code,
      name = excluded.name,
      spec = excluded.spec,
      supplier_name = excluded.supplier_name,
      unit_price = excluded.unit_price,
      minimum_order_quantity = excluded.minimum_order_quantity,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at;

  get diagnostics v_imported_count = row_count;

  insert into public.supplier_directory (
    name,
    is_active,
    updated_at
  )
  select distinct
    btrim(product.supplier_name),
    true,
    now()
  from jsonb_to_recordset(p_products) as product(supplier_name text)
  where nullif(btrim(product.supplier_name), '') is not null
  on conflict (name) do update
  set is_active = true,
      updated_at = excluded.updated_at;

  return v_imported_count;
end;
$$;

revoke execute on function public.replace_product_master(jsonb) from public, anon, authenticated;
grant execute on function public.replace_product_master(jsonb)
to service_role;

create or replace function public.replace_branches_from_upload(
  p_branches jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imported_count integer := 0;
begin
  if p_branches is null or jsonb_typeof(p_branches) <> 'array' then
    raise exception using message = 'BRANCH_UPLOAD_INVALID';
  end if;

  if jsonb_array_length(p_branches) = 0 then
    raise exception using message = 'BRANCH_UPLOAD_EMPTY';
  end if;

  update public.branches
  set is_active = false,
      updated_at = now()
  where id <> '00000000-0000-0000-0000-000000000000'::uuid;

  insert into public.branches (
    code,
    name,
    delivery_address,
    recipient_name,
    phone,
    is_active,
    business_registration_number,
    business_type,
    representative_name,
    email,
    updated_at
  )
  select
    btrim(branch.code),
    btrim(branch.name),
    branch.delivery_address,
    branch.recipient_name,
    branch.phone,
    coalesce(branch.is_active, true),
    btrim(branch.business_registration_number),
    branch.business_type,
    branch.representative_name,
    branch.email,
    now()
  from jsonb_to_recordset(p_branches) as branch(
    code text,
    name text,
    delivery_address text,
    recipient_name text,
    phone text,
    is_active boolean,
    business_registration_number text,
    business_type text,
    representative_name text,
    email text
  )
  on conflict (business_registration_number) do update
  set code = excluded.code,
      name = excluded.name,
      delivery_address = excluded.delivery_address,
      recipient_name = excluded.recipient_name,
      phone = excluded.phone,
      is_active = true,
      business_type = excluded.business_type,
      representative_name = excluded.representative_name,
      email = excluded.email,
      updated_at = excluded.updated_at;

  get diagnostics v_imported_count = row_count;

  return v_imported_count;
end;
$$;

revoke execute on function public.replace_branches_from_upload(jsonb) from public, anon, authenticated;
grant execute on function public.replace_branches_from_upload(jsonb)
to service_role;

create or replace function public.replace_supplier_directory_from_upload(
  p_suppliers jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_imported_count integer := 0;
begin
  if p_suppliers is null or jsonb_typeof(p_suppliers) <> 'array' then
    raise exception using message = 'SUPPLIER_UPLOAD_INVALID';
  end if;

  if jsonb_array_length(p_suppliers) = 0 then
    raise exception using message = 'SUPPLIER_UPLOAD_EMPTY';
  end if;

  delete from public.supplier_directory
  where id <> '00000000-0000-0000-0000-000000000000'::uuid;

  insert into public.supplier_directory (
    business_registration_number,
    name,
    representative_name,
    phone,
    email,
    address,
    is_active,
    updated_at
  )
  select
    btrim(supplier.business_registration_number),
    btrim(supplier.name),
    supplier.representative_name,
    supplier.phone,
    supplier.email,
    supplier.address,
    coalesce(supplier.is_active, true),
    now()
  from jsonb_to_recordset(p_suppliers) as supplier(
    business_registration_number text,
    name text,
    representative_name text,
    phone text,
    email text,
    address text,
    is_active boolean
  );

  get diagnostics v_imported_count = row_count;

  return v_imported_count;
end;
$$;

revoke execute on function public.replace_supplier_directory_from_upload(jsonb) from public, anon, authenticated;
grant execute on function public.replace_supplier_directory_from_upload(jsonb)
to service_role;

update public.products
set supplier_name = replace(supplier_name, '㈜', '(주)'),
    updated_at = now()
where supplier_name like '%㈜%';

update public.order_items
set supplier_name = replace(supplier_name, '㈜', '(주)')
where supplier_name like '%㈜%';

update public.supplier_directory
set name = replace(name, '㈜', '(주)'),
    updated_at = now()
where name like '%㈜%'
  and not exists (
    select 1
    from public.supplier_directory existing
    where existing.name = replace(public.supplier_directory.name, '㈜', '(주)')
      and existing.id <> public.supplier_directory.id
  );

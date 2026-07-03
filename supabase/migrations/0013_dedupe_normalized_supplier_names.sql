delete from public.supplier_directory duplicate
where duplicate.name like '%㈜%'
  and exists (
    select 1
    from public.supplier_directory canonical
    where canonical.name = replace(duplicate.name, '㈜', '(주)')
      and canonical.id <> duplicate.id
  );

update public.supplier_directory
set name = replace(name, '㈜', '(주)'),
    updated_at = now()
where name like '%㈜%';

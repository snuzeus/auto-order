do $$
begin
  if to_regclass('public.product_master_test_data') is not null then
    update public.products
    set is_active = false,
        updated_at = now()
    where barcode in (
      select product_code
      from public.product_master_test_data
    );
  end if;
end;
$$;

drop table if exists public.product_master_test_data;

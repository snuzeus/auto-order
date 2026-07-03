do $$
begin
  if to_regclass('public.product_master_test_data') is not null then
    update public.order_items
    set product_id = null
    where product_id in (
      select public.products.id
      from public.products
      where public.products.barcode in (
        select product_code
        from public.product_master_test_data
      )
    );

    delete from public.products
    where public.products.barcode in (
      select product_code
      from public.product_master_test_data
    );
  end if;
end;
$$;

drop table if exists public.product_master_test_data;

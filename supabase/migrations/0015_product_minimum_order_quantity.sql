alter table public.products
add column if not exists minimum_order_quantity integer;

alter table public.products
drop constraint if exists products_minimum_order_quantity_check;

alter table public.products
add constraint products_minimum_order_quantity_check
check (
  minimum_order_quantity is null
  or minimum_order_quantity > 0
);

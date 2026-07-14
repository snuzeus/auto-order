alter function public.submit_branch_order(uuid, date, jsonb)
rename to submit_branch_order_unchecked;

revoke execute on function public.submit_branch_order_unchecked(uuid, date, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.submit_branch_order(
  p_branch_id uuid,
  p_order_date date,
  p_items jsonb
)
returns table (order_id uuid, status order_status, branch_id uuid, order_date date)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_order_date <> (now() at time zone 'Asia/Seoul')::date then
    raise exception using message = 'BRANCH_ORDER_DATE_INVALID';
  end if;

  return query
  select * from public.submit_branch_order_unchecked(p_branch_id, p_order_date, p_items);
end;
$$;

revoke execute on function public.submit_branch_order(uuid, date, jsonb)
from public, anon, authenticated;

grant execute on function public.submit_branch_order(uuid, date, jsonb)
to service_role;

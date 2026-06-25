create table if not exists public.supplier_test_data (
  supplier_code text primary key,
  supplier_name text not null,
  manager_name text not null,
  phone text not null,
  email text not null
);

insert into public.supplier_test_data (
  supplier_code,
  supplier_name,
  manager_name,
  phone,
  email
) values
  ('SUP-001', '서울뷰티물류', '김민수', '02-6200-1001', 'seoul-beauty@example.com'),
  ('SUP-002', '한강생활유통', '박지연', '02-6200-1002', 'hangang-life@example.com'),
  ('SUP-003', '케이헤어파트너스', '이준호', '031-710-2001', 'k-hair@example.com'),
  ('SUP-004', '브라이트코스메틱', '최서연', '032-550-3001', 'bright-cos@example.com'),
  ('SUP-005', '데일리살롱물류', '정우진', '051-910-4001', 'daily-salon@example.com')
on conflict (supplier_code) do update
set supplier_name = excluded.supplier_name,
    manager_name = excluded.manager_name,
    phone = excluded.phone,
    email = excluded.email;

insert into public.branches (
  code,
  name,
  delivery_address,
  recipient_name,
  phone,
  is_active
) values
  ('BR-SEOUL-01', '강남점', '서울특별시 강남구 테헤란로 123 1층', '강남점 매니저', '02-555-0101', true),
  ('BR-SEOUL-02', '홍대점', '서울특별시 마포구 양화로 88 2층', '홍대점 매니저', '02-555-0102', true),
  ('BR-GYEONGGI-01', '분당점', '경기도 성남시 분당구 정자일로 45', '분당점 매니저', '031-555-0201', true),
  ('BR-GYEONGGI-02', '수원점', '경기도 수원시 팔달구 권광로 210', '수원점 매니저', '031-555-0202', true),
  ('BR-INCHEON-01', '송도점', '인천광역시 연수구 컨벤시아대로 77', '송도점 매니저', '032-555-0301', true),
  ('BR-DAEJEON-01', '대전둔산점', '대전광역시 서구 둔산로 100', '대전둔산점 매니저', '042-555-0401', true),
  ('BR-DAEGU-01', '대구동성로점', '대구광역시 중구 동성로 25', '대구동성로점 매니저', '053-555-0501', true),
  ('BR-BUSAN-01', '부산서면점', '부산광역시 부산진구 중앙대로 700', '부산서면점 매니저', '051-555-0601', true)
on conflict (code) do update
set name = excluded.name,
    delivery_address = excluded.delivery_address,
    recipient_name = excluded.recipient_name,
    phone = excluded.phone,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.products (
  barcode,
  product_code,
  name,
  spec,
  supplier_name,
  unit_price,
  is_active
)
select
  product_code as barcode,
  product_code,
  product_name as name,
  '입수 ' || pack_quantity::text || '개' as spec,
  supplier_name,
  supply_price as unit_price,
  true as is_active
from public.product_master_test_data
on conflict (barcode) do update
set product_code = excluded.product_code,
    name = excluded.name,
    spec = excluded.spec,
    supplier_name = excluded.supplier_name,
    unit_price = excluded.unit_price,
    is_active = excluded.is_active,
    updated_at = now();

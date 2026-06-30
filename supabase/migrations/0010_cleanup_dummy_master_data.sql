drop table if exists public.supplier_test_data;

update public.branches
set is_active = false,
    updated_at = now()
where code in (
  'BR-SEOUL-01',
  'BR-SEOUL-02',
  'BR-GYEONGGI-01',
  'BR-GYEONGGI-02',
  'BR-INCHEON-01',
  'BR-DAEJEON-01',
  'BR-DAEGU-01',
  'BR-BUSAN-01'
);

delete from public.supplier_directory;

drop index if exists public.branches_business_registration_number_idx;

create unique index if not exists branches_business_registration_number_idx
on public.branches (business_registration_number);

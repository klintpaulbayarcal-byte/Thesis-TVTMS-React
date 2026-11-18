alter table public.users
  add column if not exists driver_license_number varchar(30),
  add column if not exists driver_license_expiry date,
  add column if not exists vehicle_registration_number varchar(30),
  add column if not exists vehicle_registration_expiry date,
  add column if not exists vehicle_type varchar(20),
  add column if not exists vehicle_make varchar(80);

create index if not exists idx_users_driver_license_number on public.users(driver_license_number);
create index if not exists idx_users_vehicle_registration_number on public.users(vehicle_registration_number);

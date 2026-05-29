
create table public.purity_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  delivery_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.purity_pieces (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.purity_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  weight_grams numeric(12,3) not null check (weight_grams > 0),
  purity numeric(6,3) check (purity is null or (purity > 0 and purity <= 1000)),
  created_at timestamptz not null default now()
);

create index on public.purity_trips (user_id, delivery_date desc);
create index on public.purity_pieces (trip_id);

grant select, insert, update, delete on public.purity_trips to authenticated;
grant all on public.purity_trips to service_role;
grant select, insert, update, delete on public.purity_pieces to authenticated;
grant all on public.purity_pieces to service_role;

alter table public.purity_trips enable row level security;
alter table public.purity_pieces enable row level security;

create policy "trips_owner_select" on public.purity_trips for select to authenticated using (auth.uid() = user_id);
create policy "trips_owner_insert" on public.purity_trips for insert to authenticated with check (auth.uid() = user_id);
create policy "trips_owner_update" on public.purity_trips for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trips_owner_delete" on public.purity_trips for delete to authenticated using (auth.uid() = user_id);

create policy "pieces_owner_select" on public.purity_pieces for select to authenticated using (auth.uid() = user_id);
create policy "pieces_owner_insert" on public.purity_pieces for insert to authenticated with check (auth.uid() = user_id);
create policy "pieces_owner_update" on public.purity_pieces for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "pieces_owner_delete" on public.purity_pieces for delete to authenticated using (auth.uid() = user_id);

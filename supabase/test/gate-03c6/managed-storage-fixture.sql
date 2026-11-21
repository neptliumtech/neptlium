-- Only the empty Storage contract consumed by the application documents migration.
grant usage, create on schema storage to postgres;
set role postgres;
create table storage.buckets(id text primary key, name text not null, public boolean not null default false);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text not null);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
language sql immutable set search_path = '' as $$
  select (string_to_array(name, '/'))[1:greatest(cardinality(string_to_array(name, '/')) - 1, 0)];
$$;

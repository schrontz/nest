do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema auth;
create schema storage;
create schema vault;
create schema net;
create schema cron;

create table auth.users (id uuid primary key, email varchar);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select string_to_array(name, '/') $$;

create table vault.decrypted_secrets (name text, decrypted_secret text);

create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}')
  returns bigint language sql as $$ select 1::bigint $$;

create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text)
  returns bigint language plpgsql as $$
  declare id bigint;
  begin
    insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
    returning jobid into id;
    return id;
  end $$;

create publication supabase_realtime;

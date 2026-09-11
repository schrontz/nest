-- ===========================================================================
-- Nest -- vollstaendiges Datenbankschema
-- ===========================================================================
--
-- Das hier ist der komplette Stand der Supabase-Datenbank, aus der laufenden
-- Instanz erzeugt. Zweck: nachlesen koennen, was es gibt, und im Notfall
-- (geloeschtes oder pausiertes Projekt) alles wieder aufbauen koennen.
--
-- WARUM KEINE EINZELNEN MIGRATIONS-DATEIEN:
-- Die Tabellen households, household_members, shopping_items, stores und
-- departments sind vor der ersten getrackten Migration im SQL-Editor
-- entstanden. Die 25 Migrationen in Supabase setzen darauf auf und wuerden
-- auf einer leeren Datenbank sofort scheitern. Eine Datei mit dem echten
-- Ist-Stand ist ehrlicher als eine Historie, die sich nicht abspielen laesst.
-- Die Historie selbst liegt weiterhin in Supabase unter
-- supabase_migrations.schema_migrations.
--
-- WAS HIER NICHT DRIN STEHT (weil es nicht in der Datenbank lebt):
--   * Auth-Einstellungen aus dem Dashboard (Redirect-URLs, E-Mail-Vorlagen,
--     Leaked Password Protection)
--   * die Vault-Geheimnisse vapid_public_key, vapid_private_key, cron_secret
--   * die Edge Function send-due-notifications (deploy mit verify_jwt: false,
--     sie authentifiziert sich ueber den Header x-cron-secret)
--   * die Inhalte des Storage-Buckets, also die hochgeladenen Bilder
--
-- Reihenfolge beim Einspielen: von oben nach unten.
-- Voraussetzung: ein frisches Supabase-Projekt (auth, storage, vault und
-- die Erweiterungen pg_cron und pg_net sind dort schon vorhanden).
-- ===========================================================================


-- ============ 1. Aufzaehlungstyp ============

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mengeneinheit') then
    create type public.mengeneinheit as enum (
      'stueck', 'gramm', 'kilogramm', 'liter', 'milliliter', 'packung'
    );
  end if;
end
$$;


-- ============ 2. Tabellen ============
-- Reihenfolge wegen der Fremdschluessel: households zuerst, dann alles,
-- was daran haengt.

create table if not exists public.households (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  join_code text,
  constraint households_pkey primary key (id),
  constraint households_join_code_key unique (join_code)
);

create table if not exists public.household_members (
  household_id uuid not null,
  user_id uuid not null,
  joined_at timestamp with time zone default now() not null,
  constraint household_members_pkey primary key (household_id, user_id),
  constraint household_members_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint household_members_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.profiles (
  id uuid not null,
  display_name text,
  updated_at timestamp with time zone default now() not null,
  notify_chores boolean default true not null,
  notify_plants boolean default true not null,
  avatar_path text,
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_display_name_length check (((display_name is null) or ((char_length(btrim(display_name)) >= 1) and (char_length(btrim(display_name)) <= 60))))
);

create table if not exists public.stores (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  address text,
  department_order jsonb default '[]'::jsonb not null,
  image_path text,
  constraint stores_pkey primary key (id),
  constraint stores_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade
);

create table if not exists public.departments (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  constraint departments_pkey primary key (id),
  constraint departments_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade
);

create table if not exists public.shopping_items (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  name text not null,
  menge numeric,
  einheit public.mengeneinheit,
  status text default 'offen'::text not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  store_id uuid,
  department_id uuid,
  priority text default 'normal'::text not null,
  constraint shopping_items_pkey primary key (id),
  constraint shopping_items_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint shopping_items_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint shopping_items_store_id_fkey foreign key (store_id) references public.stores(id) on delete set null,
  constraint shopping_items_department_id_fkey foreign key (department_id) references public.departments(id) on delete set null,
  constraint shopping_items_status_check check ((status = any (array['offen'::text, 'gekauft'::text]))),
  constraint shopping_items_priority_check check ((priority = any (array['normal'::text, 'wichtig'::text, 'dringend'::text])))
);

create table if not exists public.rooms (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  constraint rooms_pkey primary key (id),
  constraint rooms_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade
);

create table if not exists public.chores (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  title text not null,
  due_date date,
  assigned_to uuid,
  status text default 'offen'::text not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid,
  recurrence_interval_value integer,
  recurrence_interval_unit text,
  room_id uuid,
  completed_at timestamp with time zone,
  completed_by uuid,
  priority text default 'normal'::text not null,
  constraint chores_pkey primary key (id),
  constraint chores_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint chores_room_id_fkey foreign key (room_id) references public.rooms(id) on delete set null,
  constraint chores_created_by_fkey foreign key (created_by) references auth.users(id),
  constraint chores_assigned_to_fkey foreign key (assigned_to) references auth.users(id) on delete set null,
  constraint chores_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete set null,
  constraint chores_status_check check ((status = any (array['offen'::text, 'erledigt'::text]))),
  constraint chores_priority_check check ((priority = any (array['normal'::text, 'wichtig'::text, 'dringend'::text]))),
  constraint chores_recurrence_value_positive_check check (((recurrence_interval_value is null) or (recurrence_interval_value > 0))),
  constraint chores_recurrence_unit_check check (((recurrence_interval_unit is null) or (recurrence_interval_unit = any (array['tag'::text, 'woche'::text, 'monat'::text, 'jahr'::text])))),
  constraint chores_recurrence_consistent_check check (((recurrence_interval_value is null) = (recurrence_interval_unit is null)))
);

create table if not exists public.plants (
  id uuid default gen_random_uuid() not null,
  household_id uuid not null,
  room_id uuid,
  name text not null,
  species text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  image_path text,
  constraint plants_pkey primary key (id),
  constraint plants_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint plants_room_id_fkey foreign key (room_id) references public.rooms(id) on delete set null,
  constraint plants_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null
);

create table if not exists public.plant_care_tasks (
  id uuid default gen_random_uuid() not null,
  plant_id uuid not null,
  household_id uuid not null,
  type text not null,
  status text default 'offen'::text not null,
  due_date date,
  assigned_to uuid,
  recurrence_interval_value integer,
  recurrence_interval_unit text,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  completed_by uuid,
  constraint plant_care_tasks_pkey primary key (id),
  -- eine Pflege-Art pro Pflanze: kein zweites "Giessen" auf derselben Pflanze
  constraint plant_care_tasks_plant_id_type_key unique (plant_id, type),
  constraint plant_care_tasks_plant_id_fkey foreign key (plant_id) references public.plants(id) on delete cascade,
  constraint plant_care_tasks_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade,
  constraint plant_care_tasks_assigned_to_fkey foreign key (assigned_to) references auth.users(id) on delete set null,
  constraint plant_care_tasks_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null,
  constraint plant_care_tasks_completed_by_fkey foreign key (completed_by) references auth.users(id) on delete set null,
  constraint plant_care_tasks_type_check check ((type = any (array['giessen'::text, 'duengen'::text, 'umtopfen'::text]))),
  constraint plant_care_tasks_recurrence_interval_unit_check check ((recurrence_interval_unit = any (array['tag'::text, 'woche'::text, 'monat'::text, 'jahr'::text])))
);

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null,
  constraint push_subscriptions_pkey primary key (id),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create table if not exists public.join_attempts (
  id bigint generated always as identity not null,
  user_id uuid not null,
  attempted_at timestamp with time zone default now() not null,
  constraint join_attempts_pkey primary key (id),
  constraint join_attempts_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

comment on table public.join_attempts is
  'Bremse gegen das Durchprobieren von Beitritts-Codes. Wird ausschliesslich '
  'von join_household_by_code (SECURITY DEFINER) geschrieben. RLS ist an und '
  'es gibt bewusst KEINE Policy: damit kommt niemand direkt an die Tabelle. '
  'Der Datenbank-Linter meldet das als Hinweis -- das ist hier Absicht.';


-- ============ 3. Indizes ============
-- Ueberwiegend auf Fremdschluesselspalten. Der Linter meldet sie als
-- "unbenutzt", weil die Tabellen noch klein sind und Postgres seq scans
-- waehlt. Sie bleiben trotzdem: ohne Index auf der referenzierenden Spalte
-- wird jedes DELETE am Elterndatensatz zum vollen Tabellenscan.

create index if not exists idx_chores_assigned_to on public.chores using btree (assigned_to);
create index if not exists idx_chores_completed_by on public.chores using btree (completed_by);
create index if not exists idx_chores_created_by on public.chores using btree (created_by);
create index if not exists idx_chores_household_id on public.chores using btree (household_id);
create index if not exists idx_chores_room_id on public.chores using btree (room_id);
create index if not exists idx_departments_household_id on public.departments using btree (household_id);
create index if not exists idx_household_members_user_id on public.household_members using btree (user_id);
create index if not exists idx_join_attempts_user_time on public.join_attempts using btree (user_id, attempted_at);
create index if not exists idx_plant_care_tasks_assigned_to on public.plant_care_tasks using btree (assigned_to);
create index if not exists idx_plant_care_tasks_completed_by on public.plant_care_tasks using btree (completed_by);
create index if not exists idx_plant_care_tasks_created_by on public.plant_care_tasks using btree (created_by);
create index if not exists idx_plant_care_tasks_household_id on public.plant_care_tasks using btree (household_id);
create index if not exists idx_plant_care_tasks_plant_id on public.plant_care_tasks using btree (plant_id);
create index if not exists idx_plants_created_by on public.plants using btree (created_by);
create index if not exists idx_plants_household_id on public.plants using btree (household_id);
create index if not exists idx_plants_room_id on public.plants using btree (room_id);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions using btree (user_id);
create index if not exists idx_rooms_household_id on public.rooms using btree (household_id);
create index if not exists idx_shopping_items_created_by on public.shopping_items using btree (created_by);
create index if not exists idx_shopping_items_department_id on public.shopping_items using btree (department_id);
create index if not exists idx_shopping_items_household_id on public.shopping_items using btree (household_id);
create index if not exists idx_shopping_items_store_id on public.shopping_items using btree (store_id);
create index if not exists idx_stores_household_id on public.stores using btree (household_id);


-- ============ 4. Funktionen ============
-- Alle SECURITY-DEFINER-Funktionen setzen search_path fest und pruefen die
-- Mitgliedschaft selbst -- sie laufen mit den Rechten des Eigentuemers, RLS
-- greift in ihnen also nicht.

create or replace function public.is_household_member(target_household_id uuid)
 returns boolean
 language sql
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from household_members
    where household_id = target_household_id
    and user_id = auth.uid()
  );
$function$;

create or replace function public.create_household(household_name text)
 returns table(id uuid, join_code text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_id uuid;
  new_code text;
begin
  new_code := upper(substr(md5(random()::text), 1, 6));
  insert into households (name, join_code) values (household_name, new_code)
  returning households.id into new_id;

  insert into household_members (household_id, user_id) values (new_id, auth.uid());

  return query select new_id, new_code;
end;
$function$;

create or replace function public.join_household_by_code(code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  target_household_id uuid;
  recent_attempts integer;
begin
  -- alte Einträge aufräumen, damit die Tabelle nicht unbegrenzt wächst
  delete from join_attempts where attempted_at < now() - interval '1 day';

  select count(*) into recent_attempts
    from join_attempts
    where user_id = auth.uid()
      and attempted_at > now() - interval '15 minutes';

  if recent_attempts >= 10 then
    raise exception 'Zu viele Versuche. Bitte warte ein paar Minuten und versuch es erneut.';
  end if;

  select households.id into target_household_id from households where households.join_code = upper(code);

  if target_household_id is null then
    insert into join_attempts (user_id) values (auth.uid());
    raise exception 'Ungültiger Code';
  end if;

  insert into household_members (household_id, user_id)
  values (target_household_id, auth.uid())
  on conflict (household_id, user_id) do nothing;

  -- erfolgreicher Beitritt: eigene Fehlversuche zurücksetzen
  delete from join_attempts where user_id = auth.uid();

  return target_household_id;
end;
$function$;

create or replace function public.regenerate_join_code(target_household_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_code text;
  attempt integer := 0;
begin
  if not is_household_member(target_household_id) then
    raise exception 'Kein Zugriff auf diesen Haushalt';
  end if;

  loop
    attempt := attempt + 1;
    new_code := upper(substr(md5(random()::text), 1, 6));
    begin
      update households set join_code = new_code where id = target_household_id;
      exit;
    exception when unique_violation then
      if attempt >= 5 then
        raise exception 'Konnte keinen neuen Code erzeugen, bitte erneut versuchen';
      end if;
    end;
  end loop;

  return new_code;
end;
$function$;

create or replace function public.get_household_members(target_household_id uuid)
 returns table(user_id uuid, email text, display_name text, avatar_path text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_household_member(target_household_id) then
    raise exception 'Kein Zugriff auf diesen Haushalt';
  end if;
  return query
    select hm.user_id, au.email::text, p.display_name, p.avatar_path
    from household_members hm
    join auth.users au on au.id = hm.user_id
    left join profiles p on p.id = hm.user_id
    where hm.household_id = target_household_id;
end;
$function$;

create or replace function public.leave_household(target_household_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  member_count integer;
begin
  if not is_household_member(target_household_id) then
    raise exception 'Kein Zugriff auf diesen Haushalt';
  end if;

  select count(*) into member_count
    from household_members
    where household_id = target_household_id;

  if member_count <= 1 then
    raise exception 'Du bist das einzige Mitglied in diesem Haushalt und kannst ihn nicht verlassen.';
  end if;

  update chores
    set assigned_to = null
    where household_id = target_household_id
      and assigned_to = (select auth.uid());

  delete from household_members
    where household_id = target_household_id
      and user_id = (select auth.uid());
end;
$function$;

create or replace function public.remove_household_member(target_household_id uuid, target_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_household_member(target_household_id) then
    raise exception 'Kein Zugriff auf diesen Haushalt';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'Nutze "Haushalt verlassen", um dich selbst zu entfernen';
  end if;

  if not exists (
    select 1 from household_members
    where household_id = target_household_id and user_id = target_user_id
  ) then
    raise exception 'Diese Person ist kein Mitglied dieses Haushalts';
  end if;

  update chores
    set assigned_to = null
    where household_id = target_household_id
      and assigned_to = target_user_id;

  delete from household_members
    where household_id = target_household_id
      and user_id = target_user_id;
end;
$function$;

-- Naechster Termin nach dem heutigen Tag. Springt so lange weiter, bis der
-- Termin wirklich in der Zukunft liegt -- eine seit Monaten ueberfaellige
-- Aufgabe waere sonst nach dem Abhaken sofort wieder ueberfaellig.
-- Die Wiederholungs-Arithmetik lebt bewusst nur hier, nicht zusaetzlich im
-- Client: eine Implementierung, eine Wahrheit.
create or replace function public.next_due_after_today(base date, val integer, unit text)
 returns date
 language plpgsql
 stable
 set search_path to 'public'
as $function$
declare
  d date;
  step interval;
begin
  if val is null or val < 1 or unit is null then
    return base;
  end if;

  step := case unit
    when 'tag' then make_interval(days => val)
    when 'woche' then make_interval(weeks => val)
    when 'monat' then make_interval(months => val)
    when 'jahr' then make_interval(years => val)
  end;

  if step is null then
    return base;
  end if;

  d := (coalesce(base, current_date) + step)::date;

  -- Bremse gegen Endlosschleifen bei absurden Alt-Daten.
  for i in 1..1000 loop
    exit when d > current_date;
    d := (d + step)::date;
  end loop;

  return d;
end;
$function$;

create or replace function public.reset_due_recurring_chores()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  affected integer;
begin
  update public.chores
  set
    status = 'offen',
    due_date = public.next_due_after_today(due_date, recurrence_interval_value, recurrence_interval_unit)
  where status = 'erledigt'
    and recurrence_interval_value is not null;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.reset_due_recurring_plant_care()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  affected integer;
begin
  update public.plant_care_tasks
  set
    status = 'offen',
    due_date = public.next_due_after_today(due_date, recurrence_interval_value, recurrence_interval_unit)
  where status = 'erledigt'
    and recurrence_interval_value is not null;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

-- Setzt "erledigt am / von" beim Statuswechsel. Serverseitig, damit der
-- Zeitstempel nicht von der Uhr des Handys abhaengt.
create or replace function public.set_completion_meta()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status = 'erledigt' and (old.status is distinct from 'erledigt') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status = 'offen' and (old.status is distinct from 'offen') then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$function$;

-- Liest ein Geheimnis aus dem Vault. Nur fuer den Cron-Job; authenticated
-- hat hier bewusst KEIN Ausfuehrungsrecht.
create or replace function public.get_app_secret(secret_name text)
 returns text
 language sql
 security definer
 set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$function$;


-- ============ 5. Trigger ============

drop trigger if exists trg_chores_completion_meta on public.chores;
create trigger trg_chores_completion_meta
  before update on public.chores
  for each row execute function public.set_completion_meta();

drop trigger if exists trg_plant_care_completion_meta on public.plant_care_tasks;
create trigger trg_plant_care_completion_meta
  before update on public.plant_care_tasks
  for each row execute function public.set_completion_meta();


-- ============ 6. Row Level Security ============
-- Grundregel der ganzen App: sichtbar ist, was zum eigenen Haushalt gehoert.
-- (select auth.uid()) statt auth.uid() ist Absicht -- so wertet Postgres den
-- Aufruf einmal pro Abfrage aus und nicht einmal pro Zeile.

alter table public.households          enable row level security;
alter table public.household_members   enable row level security;
alter table public.profiles            enable row level security;
alter table public.stores              enable row level security;
alter table public.departments         enable row level security;
alter table public.shopping_items      enable row level security;
alter table public.rooms               enable row level security;
alter table public.chores              enable row level security;
alter table public.plants              enable row level security;
alter table public.plant_care_tasks    enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.join_attempts       enable row level security;  -- ohne Policy, siehe Kommentar oben

drop policy if exists "Mitglieder sehen Aufgaben ihres Haushalts" on public.chores;
create policy "Mitglieder sehen Aufgaben ihres Haushalts"
  on public.chores for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Aufgaben für ihren Haushalt hinzu" on public.chores;
create policy "Mitglieder fügen Aufgaben für ihren Haushalt hinzu"
  on public.chores for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Aufgaben ihres Haushalts" on public.chores;
create policy "Mitglieder ändern Aufgaben ihres Haushalts"
  on public.chores for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Aufgaben ihres Haushalts" on public.chores;
create policy "Mitglieder löschen Aufgaben ihres Haushalts"
  on public.chores for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Abteilungen ihres Haushalts" on public.departments;
create policy "Mitglieder sehen Abteilungen ihres Haushalts"
  on public.departments for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Abteilungen für ihren Haushalt hinzu" on public.departments;
create policy "Mitglieder fügen Abteilungen für ihren Haushalt hinzu"
  on public.departments for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Abteilungen ihres Haushalts" on public.departments;
create policy "Mitglieder ändern Abteilungen ihres Haushalts"
  on public.departments for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Abteilungen ihres Haushalts" on public.departments;
create policy "Mitglieder löschen Abteilungen ihres Haushalts"
  on public.departments for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Pflege-Aufgaben ihres Haushalts" on public.plant_care_tasks;
create policy "Mitglieder sehen Pflege-Aufgaben ihres Haushalts"
  on public.plant_care_tasks for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Pflege-Aufgaben für ihren Haushalt hinzu" on public.plant_care_tasks;
create policy "Mitglieder fügen Pflege-Aufgaben für ihren Haushalt hinzu"
  on public.plant_care_tasks for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Pflege-Aufgaben ihres Haushalts" on public.plant_care_tasks;
create policy "Mitglieder ändern Pflege-Aufgaben ihres Haushalts"
  on public.plant_care_tasks for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Pflege-Aufgaben ihres Haushalts" on public.plant_care_tasks;
create policy "Mitglieder löschen Pflege-Aufgaben ihres Haushalts"
  on public.plant_care_tasks for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Pflanzen ihres Haushalts" on public.plants;
create policy "Mitglieder sehen Pflanzen ihres Haushalts"
  on public.plants for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Pflanzen für ihren Haushalt hinzu" on public.plants;
create policy "Mitglieder fügen Pflanzen für ihren Haushalt hinzu"
  on public.plants for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Pflanzen ihres Haushalts" on public.plants;
create policy "Mitglieder ändern Pflanzen ihres Haushalts"
  on public.plants for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Pflanzen ihres Haushalts" on public.plants;
create policy "Mitglieder löschen Pflanzen ihres Haushalts"
  on public.plants for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Zimmer ihres Haushalts" on public.rooms;
create policy "Mitglieder sehen Zimmer ihres Haushalts"
  on public.rooms for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Zimmer für ihren Haushalt hinzu" on public.rooms;
create policy "Mitglieder fügen Zimmer für ihren Haushalt hinzu"
  on public.rooms for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Zimmer ihres Haushalts" on public.rooms;
create policy "Mitglieder ändern Zimmer ihres Haushalts"
  on public.rooms for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Zimmer ihres Haushalts" on public.rooms;
create policy "Mitglieder löschen Zimmer ihres Haushalts"
  on public.rooms for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Artikel ihres Haushalts" on public.shopping_items;
create policy "Mitglieder sehen Artikel ihres Haushalts"
  on public.shopping_items for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Artikel für ihren Haushalt hinzu" on public.shopping_items;
create policy "Mitglieder fügen Artikel für ihren Haushalt hinzu"
  on public.shopping_items for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Artikel ihres Haushalts" on public.shopping_items;
create policy "Mitglieder ändern Artikel ihres Haushalts"
  on public.shopping_items for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Artikel ihres Haushalts" on public.shopping_items;
create policy "Mitglieder löschen Artikel ihres Haushalts"
  on public.shopping_items for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder sehen Läden ihres Haushalts" on public.stores;
create policy "Mitglieder sehen Läden ihres Haushalts"
  on public.stores for select to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder fügen Läden für ihren Haushalt hinzu" on public.stores;
create policy "Mitglieder fügen Läden für ihren Haushalt hinzu"
  on public.stores for insert to public
  with check (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder ändern Läden ihres Haushalts" on public.stores;
create policy "Mitglieder ändern Läden ihres Haushalts"
  on public.stores for update to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

drop policy if exists "Mitglieder löschen Läden ihres Haushalts" on public.stores;
create policy "Mitglieder löschen Läden ihres Haushalts"
  on public.stores for delete to public
  using (household_id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid))));

-- Haushalt selbst
drop policy if exists "Mitglieder sehen ihren Haushalt" on public.households;
create policy "Mitglieder sehen ihren Haushalt"
  on public.households for select to public
  using ((id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid)))));

drop policy if exists "Mitglieder aktualisieren ihren Haushalt" on public.households;
create policy "Mitglieder aktualisieren ihren Haushalt"
  on public.households for update to public
  using ((id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid)))))
  with check ((id in ( select household_members.household_id
   from household_members
  where (household_members.user_id = ( select auth.uid() as uid)))));

-- Mitgliedschaften: ueber die Funktion, sonst wuerde sich die Policy beim
-- Pruefen selbst aufrufen.
drop policy if exists "Mitglieder sehen alle Mitgliedschaften ihres Haushalts" on public.household_members;
create policy "Mitglieder sehen alle Mitgliedschaften ihres Haushalts"
  on public.household_members for select to public
  using (is_household_member(household_id));

-- Profile: jeder nur sein eigenes
drop policy if exists "Nutzer sehen ihr eigenes Profil" on public.profiles;
create policy "Nutzer sehen ihr eigenes Profil"
  on public.profiles for select to public
  using ((id = ( select auth.uid() as uid)));

drop policy if exists "Nutzer legen ihr eigenes Profil an" on public.profiles;
create policy "Nutzer legen ihr eigenes Profil an"
  on public.profiles for insert to public
  with check ((id = ( select auth.uid() as uid)));

drop policy if exists "Nutzer aktualisieren ihr eigenes Profil" on public.profiles;
create policy "Nutzer aktualisieren ihr eigenes Profil"
  on public.profiles for update to public
  using ((id = ( select auth.uid() as uid)))
  with check ((id = ( select auth.uid() as uid)));

-- Push-Abos: jeder nur seine eigenen Geraete
drop policy if exists "Nutzer verwalten eigene Push-Abos" on public.push_subscriptions;
create policy "Nutzer verwalten eigene Push-Abos"
  on public.push_subscriptions for all to public
  using ((user_id = ( select auth.uid() as uid)))
  with check ((user_id = ( select auth.uid() as uid)));

-- ============ 7. Ausfuehrungsrechte ============
-- Supabase vergibt EXECUTE auf neu angelegte Funktionen automatisch an anon
-- und authenticated. Deshalb erst alles wegnehmen, dann gezielt vergeben --
-- sonst haengt jede neue Funktion sofort offen an der REST-Schnittstelle.

revoke all on function public.is_household_member(uuid)          from public, anon, authenticated;
revoke all on function public.create_household(text)             from public, anon, authenticated;
revoke all on function public.join_household_by_code(text)       from public, anon, authenticated;
revoke all on function public.regenerate_join_code(uuid)         from public, anon, authenticated;
revoke all on function public.get_household_members(uuid)        from public, anon, authenticated;
revoke all on function public.leave_household(uuid)              from public, anon, authenticated;
revoke all on function public.remove_household_member(uuid,uuid) from public, anon, authenticated;
revoke all on function public.next_due_after_today(date,integer,text) from public, anon, authenticated;
revoke all on function public.reset_due_recurring_chores()       from public, anon, authenticated;
revoke all on function public.reset_due_recurring_plant_care()   from public, anon, authenticated;
revoke all on function public.get_app_secret(text)               from public, anon, authenticated;
-- Trigger-Funktion: Postgres prueft das Ausfuehrungsrecht beim Anlegen des
-- Triggers, nicht beim Feuern -- der Entzug ist nachweislich folgenlos.
revoke all on function public.set_completion_meta()              from public, anon, authenticated;

-- Nur diese sieben ruft die App auf. Jede davon prueft die Mitgliedschaft
-- selbst -- der Datenbank-Linter meldet sie als "von Angemeldeten aufrufbar",
-- und genau so ist es gewollt.
grant execute on function public.is_household_member(uuid)          to authenticated;
grant execute on function public.create_household(text)             to authenticated;
grant execute on function public.join_household_by_code(text)       to authenticated;
grant execute on function public.regenerate_join_code(uuid)         to authenticated;
grant execute on function public.get_household_members(uuid)        to authenticated;
grant execute on function public.leave_household(uuid)              to authenticated;
grant execute on function public.remove_household_member(uuid,uuid) to authenticated;

-- Die Aufraeum-Funktionen und der Vault-Zugriff bleiben dem Cron-Job
-- vorbehalten (laeuft als postgres) -- kein Client-Zugriff.

-- pg_net liegt in diesem Projekt im Schema public. Verschieben waere riskant,
-- solange die Push-Benachrichtigungen darauf laufen; stattdessen die Rechte
-- entziehen, damit niemand ausser dem Cron-Job HTTP-Aufrufe absetzen kann.
revoke all on schema net from public, anon, authenticated;


-- ============ 8. Realtime ============
-- Die Tabellen, die im laufenden Betrieb auf dem zweiten Geraet sofort
-- nachziehen sollen.
--
-- WICHTIG fuer den Client: bei DELETE liefert Postgres nur den
-- Primaerschluessel mit -- bei aktivem RLS auch dann, wenn REPLICA IDENTITY
-- auf FULL steht. Ein Abo-Filter auf household_id kann darauf nie zutreffen.
-- Deshalb abonniert die App DELETE ungefiltert (siehe js/app.js).

alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.chores;
alter publication supabase_realtime add table public.plants;
alter publication supabase_realtime add table public.plant_care_tasks;

-- Zimmer, Laeden und Abteilungen aendern sich im Alltag fast nie -- beim
-- gemeinsamen Ersteinrichten aber laufend, und dann sitzen beide gleichzeitig
-- in den Einstellungen.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.stores;
alter publication supabase_realtime add table public.departments;


-- ============ 9. Storage ============
-- Ein oeffentlicher Bucket. Oeffentlich heisst: wer den vollstaendigen Pfad
-- kennt, sieht das Bild. Die Dateinamen sind zufaellige UUIDs, sind also
-- nicht zu erraten. Schreiben darf nur, wer laut Policy darf.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bilder', 'bilder', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- households/<household_id>/... -- Pflanzenfotos und Laden-Logos
drop policy if exists "Mitglieder verwalten Bilder ihres Haushalts" on storage.objects;
create policy "Mitglieder verwalten Bilder ihres Haushalts"
  on storage.objects for all to authenticated
  using (
    (bucket_id = 'bilder'::text)
    and ((storage.foldername(name))[1] = 'households'::text)
    and ((storage.foldername(name))[2] in ( select (household_members.household_id)::text
       from household_members
      where (household_members.user_id = ( select auth.uid() as uid))))
  )
  with check (
    (bucket_id = 'bilder'::text)
    and ((storage.foldername(name))[1] = 'households'::text)
    and ((storage.foldername(name))[2] in ( select (household_members.household_id)::text
       from household_members
      where (household_members.user_id = ( select auth.uid() as uid))))
  );

-- profiles/<user_id>/... -- Profilbilder
drop policy if exists "Eigenes Profilbild verwalten" on storage.objects;
create policy "Eigenes Profilbild verwalten"
  on storage.objects for all to authenticated
  using (
    (bucket_id = 'bilder'::text)
    and ((storage.foldername(name))[1] = 'profiles'::text)
    and ((storage.foldername(name))[2] = (( select auth.uid() as uid))::text)
  )
  with check (
    (bucket_id = 'bilder'::text)
    and ((storage.foldername(name))[1] = 'profiles'::text)
    and ((storage.foldername(name))[2] = (( select auth.uid() as uid))::text)
  );


-- ============ 10. Zeitgesteuerte Jobs (pg_cron) ============
-- Zeiten in UTC. 03:00 UTC ist im Sommer 05:00 und im Winter 04:00 deutscher
-- Zeit -- in beiden Faellen nachts, darauf kommt es an.

select cron.schedule('reset-recurring-chores', '0 3 * * *',
  $$select public.reset_due_recurring_chores();$$);

select cron.schedule('reset-recurring-plant-care', '0 3 * * *',
  $$select public.reset_due_recurring_plant_care();$$);

-- Taegliche Erinnerung um 07:00 UTC. Die Edge Function authentifiziert sich
-- ueber den Header x-cron-secret, nicht ueber ein JWT -- sie muss deshalb mit
-- verify_jwt: false deployt werden, sonst laeuft der Job ins Leere.
select cron.schedule('send-due-notifications', '0 7 * * *', $$
  select
    net.http_post(
      url := 'https://qanbxxbbngctucjbzfeb.supabase.co/functions/v1/send-due-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
$$);

-- ============ Ende ============

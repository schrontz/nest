with roh as (
select 'SPALTE|' || c.relname || '|' || a.attname || '|' || format_type(a.atttypid,a.atttypmod)
       || '|' || coalesce(pg_get_expr(d.adbin,d.adrelid),'-') || '|' || a.attnotnull::text || '|' || a.attidentity::text as z
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relkind='r'
union all
select 'CONSTRAINT|' || c.relname || '|' || co.conname || '|' || pg_get_constraintdef(co.oid)
from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
union all
select 'INDEX|' || indexname || '|' || indexdef from pg_indexes where schemaname='public'
union all
select 'POLICY|' || n.nspname || '.' || c.relname || '|' || pol.polname || '|' || pol.polcmd::text
       || '|' || coalesce((select string_agg(r.rolname,',' order by r.rolname) from pg_roles r where r.oid=any(pol.polroles)),'public')
       || '|' || coalesce(pg_get_expr(pol.polqual,pol.polrelid),'-')
       || '|' || coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'-')
from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage')
union all
select 'RLS|' || c.relname || '|' || c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all
select 'FUNKTION|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
       || '|' || pg_get_function_result(p.oid) || '|' || p.prosecdef::text || '|' || p.provolatile::text
       || '|' || md5(regexp_replace(lower(p.prosrc), '\s+', ' ', 'g'))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'TRIGGER|' || pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
union all
select 'REALTIME|' || tablename from pg_publication_tables where pubname='supabase_realtime'
union all
select 'GRANT|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid) || '|' || a.grantee::regrole::text
from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
     lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname='public' and a.privilege_type='EXECUTE'
  and a.grantee::regrole::text in ('anon','authenticated')
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'ENUM|' || t.typname || '|' || e.enumlabel || '|' || e.enumsortorder::text
from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='mengeneinheit'
union all
select 'BUCKET|' || id || '|' || public::text || '|' || file_size_limit::text || '|' || array_to_string(allowed_mime_types,',')
from storage.buckets
union all
select 'CRON|' || jobname || '|' || schedule from cron.job
), norm as (
  select split_part(z,'|',1) as kat, regexp_replace(z, '\s+', ' ', 'g') as z from roh
)
select kat, count(*) as anzahl, md5(string_agg(z, E'\n' order by z)) as pruefsumme
from norm group by kat order by kat;

-- ═══════════════════════════════════════════════════════════════════
-- Security self-check — READ ONLY, changes nothing. Run in the Supabase
-- SQL Editor and look at the "esito" column: everything should be OK.
-- Re-run after every new table / function and at least every 3 months.
-- ═══════════════════════════════════════════════════════════════════
with
tables_rls as (
  select 'Tabella senza RLS' as controllo, n.nspname || '.' || c.relname as oggetto,
         case when c.relrowsecurity then 'OK' else 'DA CORREGGERE' end as esito,
         'Senza RLS chiunque abbia la chiave pubblica può leggere/scrivere la tabella' as nota
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname = 'public'
),
anon_policies as (
  select 'Policy aperta ad anon/public', schemaname || '.' || tablename || ' · ' || policyname,
         case when roles && array['anon','public']::name[] then 'VERIFICARE' else 'OK' end,
         'Una policy per "anon" o "public" vale anche per chi non è loggato'
  from pg_policies where schemaname = 'public'
),
true_policies as (
  select 'Policy sempre vera', schemaname || '.' || tablename || ' · ' || policyname,
         case when coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)')
              then 'VERIFICARE' else 'OK' end,
         'USING (true) concede la riga a tutti i ruoli della policy'
  from pg_policies where schemaname = 'public'
),
definer_funcs as (
  select 'Funzione SECURITY DEFINER eseguibile da anon', p.oid::regprocedure::text,
         case when has_function_privilege('anon', p.oid, 'execute') then 'VERIFICARE' else 'OK' end,
         'Gira con i permessi del proprietario: non deve essere chiamabile da chi non è loggato'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
),
buckets as (
  select 'Storage bucket pubblico', b.name,
         case when b.public then 'VERIFICARE' else 'OK' end,
         'Un bucket pubblico espone i file a chiunque conosca il link'
  from storage.buckets b
),
privileged as (
  select 'Account con privilegi', coalesce(p.email, p.id::text) || ' · ' || p.role,
         'INFO',
         'Verifica che ognuno serva davvero e abbia la MFA attiva'
  from public.profiles p where lower(coalesce(p.role, '')) in ('superadmin', 'admin', 'it')
),
mfa as (
  select 'MFA attiva', u.email,
         case when exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')
              then 'OK' else 'DA ATTIVARE' end,
         'Obbligatoria per Super Admin, Admin e IT'
  from auth.users u join public.profiles p on p.id = u.id
  where lower(coalesce(p.role, '')) in ('superadmin', 'admin', 'it')
)
select * from (
select * from tables_rls
union all select * from anon_policies
union all select * from true_policies
union all select * from definer_funcs
union all select * from buckets
union all select * from privileged
union all select * from mfa
) r
order by case esito when 'DA CORREGGERE' then 0 when 'DA ATTIVARE' then 1 when 'VERIFICARE' then 2 when 'INFO' then 3 else 4 end, 1, 2;

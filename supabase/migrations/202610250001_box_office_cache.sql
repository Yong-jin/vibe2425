-- Three business tables follow ERD.md exactly. Run as the project owner.
create table public.movies (
  movie_cd text primary key,
  movie_nm text not null,
  open_dt date
);

create table public.boxoffice_periods (
  period_id bigint generated always as identity primary key,
  period_type text not null check (period_type in ('daily', 'weekly', 'weekend')),
  query_date date not null,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  schema_version integer not null,
  options_key text not null,
  result_status text not null check (result_status in ('ok', 'empty')),
  fetched_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > fetched_at),
  unique (schema_version, period_type, query_date, options_key)
);

create table public.boxoffice_results (
  period_id bigint not null references public.boxoffice_periods(period_id) on delete cascade,
  movie_cd text not null references public.movies(movie_cd) on delete restrict,
  rank integer check (rank > 0),
  sales_amt numeric(30,0) check (sales_amt >= 0),
  audi_cnt numeric(30,0) check (audi_cnt >= 0),
  sales_acc numeric(30,0) check (sales_acc >= 0),
  audi_acc numeric(30,0) check (audi_acc >= 0),
  quality_warnings jsonb not null default '[]'::jsonb,
  primary key (period_id, movie_cd)
);

create index boxoffice_results_movie_period_idx on public.boxoffice_results(movie_cd, period_id);

alter table public.movies enable row level security;
alter table public.boxoffice_periods enable row level security;
alter table public.boxoffice_results enable row level security;
revoke all on public.movies, public.boxoffice_periods, public.boxoffice_results from public, anon, authenticated;
revoke all on sequence public.boxoffice_periods_period_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.movies, public.boxoffice_periods, public.boxoffice_results to service_role;
grant usage, select on sequence public.boxoffice_periods_period_id_seq to service_role;

-- One RPC call is one PostgreSQL transaction. A failure rolls back every change.
create function public.save_box_office_period(
  p_period_type text, p_query_date date, p_period_start date, p_period_end date,
  p_fetched_at timestamptz, p_schema_version integer, p_options_key text,
  p_result_status text, p_items jsonb, p_warnings jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_period_id bigint;
  v_existing_at timestamptz;
  v_item jsonb;
  v_count integer;
begin
  if p_period_type not in ('daily', 'weekly', 'weekend') or p_schema_version < 1
     or coalesce(p_options_key, '') = '' or p_period_start > p_period_end
     or p_fetched_at is null or p_result_status not in ('ok', 'empty')
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_typeof(p_warnings) is distinct from 'array' then
    raise exception 'invalid box office period';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count > 10 or (p_result_status = 'empty') <> (v_count = 0) then
    raise exception 'invalid box office item count';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(p_warnings) as w(value)
              where pg_catalog.jsonb_typeof(w.value) <> 'string') then
    raise exception 'invalid warning list';
  end if;

  -- The lock serializes writers of the same cache key, including across servers.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_schema_version::text || ':' || p_period_type || ':' || p_query_date::text || ':' || p_options_key, 0));
  select period_id, fetched_at into v_period_id, v_existing_at
    from public.boxoffice_periods
   where schema_version = p_schema_version and period_type = p_period_type
     and query_date = p_query_date and options_key = p_options_key;
  if found and v_existing_at >= p_fetched_at then
    return pg_catalog.jsonb_build_object('saved', false, 'fetchedAt', v_existing_at);
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.jsonb_typeof(v_item->'movieCd') <> 'string'
       or pg_catalog.btrim(v_item->>'movieCd') = ''
       or pg_catalog.jsonb_typeof(v_item->'movieNm') <> 'string'
       or pg_catalog.btrim(v_item->>'movieNm') = ''
       or (v_item->>'openDt' is not null and
           (pg_catalog.jsonb_typeof(v_item->'openDt') <> 'string'
            or v_item->>'openDt' !~ '^\d{4}-\d{2}-\d{2}$'))
       or (v_item->>'rank' is not null and
           (pg_catalog.jsonb_typeof(v_item->'rank') <> 'number'
            or (v_item->>'rank')::numeric < 1 or (v_item->>'rank')::numeric > 2147483647
            or (v_item->>'rank')::numeric <> pg_catalog.trunc((v_item->>'rank')::numeric))) then
      raise exception 'invalid movie identity or rank';
    end if;
    if exists (
      select 1 from (values ('salesAmt'), ('audiCnt'), ('salesAcc'), ('audiAcc')) as f(name)
       where v_item->f.name <> 'null'::jsonb and
         (pg_catalog.jsonb_typeof(v_item->f.name) is distinct from 'string'
          or v_item->>f.name !~ '^[0-9]{1,30}$')
    ) then
      raise exception 'invalid numeric field';
    end if;
  end loop;
  if (select count(distinct value->>'movieCd') from pg_catalog.jsonb_array_elements(p_items)) <> v_count then
    raise exception 'duplicate movie code';
  end if;

  -- 1. Movies, 2. period, 3. complete replacement of results.
  insert into public.movies(movie_cd, movie_nm, open_dt)
  select value->>'movieCd', value->>'movieNm', nullif(value->>'openDt', '')::date
    from pg_catalog.jsonb_array_elements(p_items)
  on conflict (movie_cd) do update set movie_nm = excluded.movie_nm, open_dt = excluded.open_dt;

  insert into public.boxoffice_periods(
    period_type, query_date, period_start, period_end, schema_version, options_key,
    result_status, fetched_at, expires_at)
  values (p_period_type, p_query_date, p_period_start, p_period_end, p_schema_version,
          p_options_key, p_result_status, p_fetched_at,
          p_fetched_at + case when p_result_status = 'empty' then interval '1 hour' else interval '24 hours' end)
  on conflict (schema_version, period_type, query_date, options_key)
  do update set period_start = excluded.period_start, period_end = excluded.period_end,
                result_status = excluded.result_status, fetched_at = excluded.fetched_at,
                expires_at = excluded.expires_at
  returning period_id into v_period_id;

  delete from public.boxoffice_results where period_id = v_period_id;
  insert into public.boxoffice_results(
    period_id, movie_cd, rank, sales_amt, audi_cnt, sales_acc, audi_acc, quality_warnings)
  select v_period_id, item.value->>'movieCd', (item.value->>'rank')::integer,
         (item.value->>'salesAmt')::numeric(30,0), (item.value->>'audiCnt')::numeric(30,0),
         (item.value->>'salesAcc')::numeric(30,0), (item.value->>'audiAcc')::numeric(30,0),
         coalesce((select pg_catalog.jsonb_agg(w.value)
                     from pg_catalog.jsonb_array_elements(p_warnings) as w(value)
                    where pg_catalog.jsonb_typeof(w.value) = 'string'
                      and pg_catalog.starts_with(w.value #>> '{}', item.value->>'movieCd' || '.')), '[]'::jsonb)
    from pg_catalog.jsonb_array_elements(p_items) as item(value);
  return pg_catalog.jsonb_build_object('saved', true, 'fetchedAt', p_fetched_at);
end;
$$;

create function public.read_box_office_period(
  p_period_type text, p_query_date date, p_schema_version integer, p_options_key text
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_period public.boxoffice_periods%rowtype;
  v_items jsonb;
  v_warnings jsonb;
begin
  select * into v_period from public.boxoffice_periods
   where period_type = p_period_type and query_date = p_query_date
     and schema_version = p_schema_version and options_key = p_options_key;
  if not found then return null; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'movieCd', r.movie_cd, 'movieNm', m.movie_nm, 'openDt', m.open_dt,
      'rank', r.rank, 'salesAmt', r.sales_amt::text, 'audiCnt', r.audi_cnt::text,
      'salesAcc', r.sales_acc::text, 'audiAcc', r.audi_acc::text)
      order by r.rank nulls last, r.movie_cd), '[]'::jsonb)
    into v_items from public.boxoffice_results r
    join public.movies m on m.movie_cd = r.movie_cd where r.period_id = v_period.period_id;
  select coalesce(pg_catalog.jsonb_agg(w.value), '[]'::jsonb) into v_warnings
    from public.boxoffice_results r,
         lateral pg_catalog.jsonb_array_elements(r.quality_warnings) as w(value)
   where r.period_id = v_period.period_id;
  return pg_catalog.jsonb_build_object(
    'status', v_period.result_status, 'queryDate', v_period.query_date,
    'periodType', v_period.period_type, 'periodStart', v_period.period_start,
    'periodEnd', v_period.period_end, 'fetchedAt', v_period.fetched_at,
    'expiresAt', v_period.expires_at, 'warnings', v_warnings, 'items', v_items);
end;
$$;

revoke execute on function public.save_box_office_period(text,date,date,date,timestamptz,integer,text,text,jsonb,jsonb)
  from public, anon, authenticated;
revoke execute on function public.read_box_office_period(text,date,integer,text)
  from public, anon, authenticated;
grant execute on function public.save_box_office_period(text,date,date,date,timestamptz,integer,text,text,jsonb,jsonb)
  to service_role;
grant execute on function public.read_box_office_period(text,date,integer,text)
  to service_role;

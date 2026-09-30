-- Ton pickup CHINH XAC: dem COUNT(DISTINCT shipment_id) truc tiep tu raw
-- pickup_48h_no_api2 theo status, group theo (area, ward, cot).
-- Chay file nay 1 lan trong Supabase SQL editor, sau do trang Ton pickup
-- se doc qua RPC nay (1 roundtrip, payload nhe) thay vi quet raw o client.
--
-- Ly do: bang pickup_48h_summary_groups chi co cot assign/onhold gop san,
-- khong phai "tong don co status X trong raw" nen tong phuong bi lech.

create index if not exists pickup_48h_no_api2_status_area_ward_idx
  on public.pickup_48h_no_api2 (status, area, ward);

create or replace function public.pickup_ward_board(p_status text)
returns table (
  area text,
  ward text,
  cot text,
  orders bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    t.area,
    coalesce(nullif(btrim(t.ward), ''), 'Chưa có phường') as ward,
    coalesce(nullif(btrim(t.cot_group), ''), 'COT1') as cot,
    count(distinct t.shipment_id) as orders
  from public.pickup_48h_no_api2 as t
  where t.status = p_status
    and t.area in ('KV5', 'KV6')
  group by t.area, coalesce(nullif(btrim(t.ward), ''), 'Chưa có phường'), coalesce(nullif(btrim(t.cot_group), ''), 'COT1')
$function$;

grant execute on function public.pickup_ward_board(text) to authenticated;
grant execute on function public.pickup_ward_board(text) to service_role;

-- Chi tiet 1 phuong (panel rider + popup chi tiet): di RPC POST thay vi GET
-- query-string tieng Viet (tung bi gateway tra "No API key found").
create or replace function public.pickup_ward_detail(p_area text, p_ward text, p_status text)
returns table (
  pickup_point_id text,
  pickup_point_name text,
  shipment_id text,
  cot_group text,
  assigned_riders_today text,
  zone_name text
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    t.pickup_point_id,
    t.pickup_point_name,
    t.shipment_id,
    t.cot_group,
    t.assigned_riders_today,
    t.zone_name
  from public.pickup_48h_no_api2 as t
  where t.area = p_area
    and t.ward = p_ward
    and t.status = p_status
  limit 2000
$function$;

grant execute on function public.pickup_ward_detail(text, text, text) to authenticated;
grant execute on function public.pickup_ward_detail(text, text, text) to service_role;

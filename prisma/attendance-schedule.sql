begin;

delete from public.attendance_logs older
using public.attendance_logs newer
where older.rider_code = newer.rider_code
  and older.work_date = newer.work_date
  and (
    older.updated_at < newer.updated_at
    or (older.updated_at = newer.updated_at and older.id < newer.id)
  );

create unique index if not exists attendance_logs_rider_code_work_date_key
  on public.attendance_logs (rider_code, work_date);

commit;

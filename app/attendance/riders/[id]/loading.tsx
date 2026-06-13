export default function RiderAttendanceLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

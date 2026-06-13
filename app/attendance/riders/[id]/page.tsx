import { ProtectedPage } from "@/components/layout/protected-page";
import { RiderMonthView } from "@/components/attendance/rider-month-view";

export default async function RiderAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const monthValue = Array.isArray(query.month) ? query.month[0] : query.month;
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue ?? "")
    ? monthValue!
    : new Date().toISOString().slice(0, 7);

  return (
    <ProtectedPage>
      <RiderMonthView riderId={id} initialMonth={initialMonth} />
    </ProtectedPage>
  );
}

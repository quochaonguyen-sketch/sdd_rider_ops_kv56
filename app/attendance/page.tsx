import { ProtectedPage } from "@/components/layout/protected-page";
import { AttendanceView } from "@/components/attendance/attendance-view";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const query = await searchParams;
  const monthValue = Array.isArray(query.month) ? query.month[0] : query.month;
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue ?? "") ? monthValue : undefined;

  return (
    <ProtectedPage>
      <AttendanceView initialMonth={initialMonth} />
    </ProtectedPage>
  );
}

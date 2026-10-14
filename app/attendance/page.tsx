import { ProtectedPage } from "@/components/layout/protected-page";
import { AttendanceView } from "@/components/attendance/attendance-view";
import Link from "next/link";
import { CotAttendanceView } from "@/components/attendance/cot-attendance-view";
import { vietnamDate } from "@/lib/attendance/cot-attendance";
import styles from "@/components/attendance/cot-attendance-view.module.css";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; view?: string | string[] }>;
}) {
  const query = await searchParams;
  const monthValue = Array.isArray(query.month) ? query.month[0] : query.month;
  const initialMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue ?? "") ? monthValue : undefined;
  const viewValue = Array.isArray(query.view) ? query.view[0] : query.view;
  const scheduleView = viewValue === "schedule" || (!viewValue && Boolean(initialMonth));

  return (
    <ProtectedPage>
      <nav className={styles.navigation} aria-label="Chế độ chấm công">
        <Link href="/attendance?view=cot" aria-current={!scheduleView ? "page" : undefined}>Điểm danh COT</Link>
        <Link href="/attendance?view=schedule" aria-current={scheduleView ? "page" : undefined}>Lịch làm việc & nghỉ</Link>
      </nav>
      {scheduleView ? <AttendanceView initialMonth={initialMonth} /> : <CotAttendanceView initialDate={vietnamDate(new Date())} />}
    </ProtectedPage>
  );
}

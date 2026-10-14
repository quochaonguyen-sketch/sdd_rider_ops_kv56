import Link from "next/link";
import { CotAttendanceView } from "@/components/attendance/cot-attendance-view";
import { vietnamDate } from "@/lib/attendance/cot-attendance";

export default function AttendancePreviewPage() {
  return <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-8 lg:px-12 lg:py-10">
    <div className="mb-7 flex items-center justify-between gap-3 text-sm"><strong>Rider Ops / Điểm danh COT</strong><Link className="text-blue-700 underline underline-offset-4" href="/attendance">Về trang Attendance</Link></div>
    <CotAttendanceView demo initialDate={vietnamDate(new Date())} />
  </main>;
}

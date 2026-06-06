import { ProtectedPage } from "@/components/layout/protected-page";
import { AttendanceView } from "@/components/attendance/attendance-view";

export default function AttendancePage() {
  return (
    <ProtectedPage>
      <AttendanceView />
    </ProtectedPage>
  );
}

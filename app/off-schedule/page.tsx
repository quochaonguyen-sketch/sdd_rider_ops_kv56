import { ProtectedPage } from "@/components/layout/protected-page";
import { OffScheduleView } from "@/components/off-schedule/off-schedule-view";

export default function OffSchedulePage() {
  return <ProtectedPage><OffScheduleView /></ProtectedPage>;
}

import { ProtectedPage } from "@/components/layout/protected-page";
import { NotesView } from "@/components/notes/notes-view";

export default function NotesPage() {
  return <ProtectedPage><NotesView /></ProtectedPage>;
}

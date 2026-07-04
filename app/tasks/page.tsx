import { ProtectedPage } from "@/components/layout/protected-page";
import { TasksView } from "@/components/tasks/tasks-view";

export default function TasksPage() { return <ProtectedPage><TasksView /></ProtectedPage>; }

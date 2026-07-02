import { ProtectedPage } from "@/components/layout/protected-page";
import { ViolationsView } from "@/components/violations/violations-view";

export default function ViolationsPage() { return <ProtectedPage><ViolationsView /></ProtectedPage>; }

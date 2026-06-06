import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Settings</h1>
          <p className="text-sm text-slate-500">MVP configuration checklist.</p>
        </div>
        <Card>
          <ul className="space-y-3 text-sm text-slate-700">
            <li>Set Supabase URL, anon key, service role key, database URLs, and import secret in `.env.local`.</li>
            <li>Enable Supabase Realtime publication for `riders`, `attendance_logs`, `zones`, and `activity_logs`.</li>
            <li>Create users in Supabase Auth and insert matching `profiles` rows with `admin`, `leader`, or `viewer` roles.</li>
          </ul>
        </Card>
      </div>
    </ProtectedPage>
  );
}

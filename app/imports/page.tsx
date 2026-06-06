import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/ui/card";

export default function ImportsPage() {
  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Imports</h1>
          <p className="text-sm text-slate-500">Server endpoints for Python data ingestion.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-base font-semibold text-slate-950">Rider import</h2>
            <p className="mt-2 text-sm text-slate-600">POST JSON records to:</p>
            <pre className="mt-3 rounded-md bg-slate-950 p-3 text-sm text-slate-100">/api/import/riders</pre>
          </Card>
          <Card>
            <h2 className="text-base font-semibold text-slate-950">Attendance import</h2>
            <p className="mt-2 text-sm text-slate-600">POST JSON records to:</p>
            <pre className="mt-3 rounded-md bg-slate-950 p-3 text-sm text-slate-100">/api/import/attendance</pre>
          </Card>
        </div>
        <Card>
          <h2 className="text-base font-semibold text-slate-950">Authentication</h2>
          <p className="mt-2 text-sm text-slate-600">Both endpoints require the secret header below. Keep this value server-side only.</p>
          <pre className="mt-3 rounded-md bg-slate-950 p-3 text-sm text-slate-100">x-import-secret: &lt;IMPORT_SECRET&gt;</pre>
        </Card>
      </div>
    </ProtectedPage>
  );
}

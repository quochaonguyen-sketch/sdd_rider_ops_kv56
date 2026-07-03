import { ProtectedPage } from "@/components/layout/protected-page";
import { Card } from "@/components/ui/card";
import { MemberManagement } from "@/components/settings/member-management";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const { data: profile } = user ? await createAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const isAdmin = profile?.role === "admin";

  return (
    <ProtectedPage>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Administration</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Quản lý hệ thống</h1>
          <p className="mt-1 text-sm text-slate-500">Tài khoản thành viên và phân quyền truy cập Rider Operations.</p>
        </div>
        {isAdmin ? <MemberManagement /> : <Card className="border-amber-200 bg-amber-50"><h2 className="font-bold text-amber-900">Khu vực dành cho Admin</h2><p className="mt-1 text-sm text-amber-800">Tài khoản của bạn không có quyền quản lý thành viên.</p></Card>}
      </div>
    </ProtectedPage>
  );
}

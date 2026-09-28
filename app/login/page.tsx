import { LoginForm } from "@/components/layout/login-form";

const messages: Record<string, string> = {
  domain: "Chỉ tài khoản @spxexpress.com mới được phép truy cập.",
  not_allowed: "Email này chưa được thêm vào danh sách thành viên. Liên hệ admin để được cấp quyền.",
  oauth: "Không thể hoàn tất đăng nhập Google. Vui lòng thử lại.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginForm initialError={error ? messages[error] ?? messages.oauth : undefined} />;
}

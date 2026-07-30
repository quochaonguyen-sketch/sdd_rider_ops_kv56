import Link from "next/link";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";

/**
 * Hallmark component preview.
 * Render this under a Next.js <Link> in Storybook/dev tooling to inspect the
 * route-ready loading state without wiring it into production navigation.
 */
export function NavigationPendingIndicatorPreview() {
  return (
    <div className="app-navigation-preview">
      <p>Trạng thái nghỉ: không che nội dung.</p>
      <p>Trạng thái chờ: thanh tiến trình và rider SPX xuất hiện sau 120 ms.</p>
      <Link href="/dashboard">
        Mở Dashboard
        <NavigationPendingIndicator />
      </Link>
    </div>
  );
}

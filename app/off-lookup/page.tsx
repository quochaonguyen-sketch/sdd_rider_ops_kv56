import type { Metadata } from "next";
import { PublicOffLookup } from "@/components/off-schedule/public-off-lookup";

export const metadata: Metadata = {
  title: "Tra cứu lịch OFF | Rider Operations",
  description: "Tra cứu lịch OFF của rider theo mã rider.",
};

export default function OffLookupPage() {
  return <PublicOffLookup />;
}

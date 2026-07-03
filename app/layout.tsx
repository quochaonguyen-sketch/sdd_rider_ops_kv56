import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Rider Operations | Khu vực 5 & 6 SDD",
  description: "Hệ thống quản lý và điều phối đội ngũ giao nhận Khu vực 5 & 6 SDD",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}

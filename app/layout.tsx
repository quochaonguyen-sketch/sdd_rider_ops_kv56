import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const themeBootScript = `(()=>{try{const saved=localStorage.getItem("rider-ops-theme");const dark=saved? saved==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);document.documentElement.dataset.theme=dark?"dark":"light"}catch{}})()`;

export const metadata: Metadata = {
  title: "Rider Operations | Khu vực 5 & 6 SDD",
  description: "Hệ thống quản lý và điều phối đội ngũ giao nhận Khu vực 5 & 6 SDD",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /></head>
      <body>{children}</body>
    </html>
  );
}

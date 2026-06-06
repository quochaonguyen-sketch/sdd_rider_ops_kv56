import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rider Ops",
  description: "Realtime rider workforce management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

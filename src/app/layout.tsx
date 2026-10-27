import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "REIBRY — Meta Edition",
  description: "From Saved to Done. A personal AI memory and action platform.",
};
export const viewport: Viewport = { themeColor: "#0F6B5C", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}

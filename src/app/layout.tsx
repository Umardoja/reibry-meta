import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthSessionProvider } from "@/components/auth/auth-session-provider";
import "./globals.css";
// Stage 12J-3 consumer design layer; loaded after globals.css so it can refine it.
import "./atlas.css";
export const metadata: Metadata = {
  title: "REIBRY — From saved to done",
  description: "From Saved to Done. A personal AI memory and action platform.",
  applicationName: "REIBRY",
  appleWebApp: { capable: true, title: "REIBRY", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#0F6B5C", viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><AuthSessionProvider><AppShell>{children}</AppShell></AuthSessionProvider></body></html>;
}

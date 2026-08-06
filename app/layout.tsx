// app/layout.tsx
//
// One clean geometric sans carries the whole design — Mela-style apps lean
// on weight and color for hierarchy rather than mixing type families.
//
// force-dynamic: reads the dark_mode preference fresh on every request, so
// toggling it in Preferences takes effect immediately instead of hitting
// the same stale-cache issue other pages had earlier.

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { createClient } from "@supabase/supabase-js";
import "./globals.css";
import BottomNav from "./components/BottomNav";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Kitchen Assistant",
  description: "Weekly meal planning that ends in a filled cart, not a to-do list.",
};

async function getDarkMode(): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase.from("preferences").select("dark_mode").single();
    return data?.dark_mode ?? false;
  } catch {
    return false; // no preferences row yet, or the column doesn't exist — default light
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const darkMode = await getDarkMode();

  return (
    <html lang="en" className={`${jakarta.variable} ${darkMode ? "dark" : ""}`}>
      <body className="font-[family-name:var(--font-sans)] bg-white dark:bg-[#121212]">
        <div className="pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}

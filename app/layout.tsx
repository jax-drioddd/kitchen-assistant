// app/layout.tsx
//
// One clean geometric sans carries the whole design — Mela-style apps lean
// on weight and color for hierarchy rather than mixing type families.

import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-[family-name:var(--font-sans)] bg-[#F7F6F2]">
        <div className="pb-20">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}

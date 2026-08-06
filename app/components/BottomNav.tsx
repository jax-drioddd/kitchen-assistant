// app/components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ACCENT = "#E8674A";

const TABS = [
  { href: "/", icon: "🍽️", label: "This Week" },
  { href: "/plan", icon: "📝", label: "Plan" },
  { href: "/inventory", icon: "🧺", label: "Stock" },
  { href: "/history", icon: "📅", label: "History" },
  { href: "/preferences", icon: "⚙️", label: "Settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#1A1A1A]/8 dark:border-[#F0F0F0]/8 bg-white dark:bg-[#161616]">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 transition-colors"
              style={active ? { backgroundColor: ACCENT } : undefined}
            >
              <span className="text-lg">{tab.icon}</span>
              <span
                className={`text-[10px] font-semibold ${
                  active ? "text-white" : "text-[#1A1A1A]/60 dark:text-[#F0F0F0]/60"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "מתכונים", icon: "🎂" },
  { href: "/ingredients", label: "מחירים", icon: "🏷️" },
  { href: "/settings", label: "הגדרות", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 right-0 left-0 bg-white border-t border-amber-200 flex z-50">
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition-colors ${
              active ? "text-amber-600 font-semibold" : "text-gray-500"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { clearAdminSession, getAdminSession } from "@/lib/adminSession";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/payments", label: "Payments" },
];

export default function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    // Deferred check avoids a synchronous setState in the effect body.
    const timer = setTimeout(() => {
      const session = getAdminSession();
      if (!session) {
        router.replace("/admin/login");
        return;
      }
      setUsername(session.username);
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [router]);

  function handleLogout() {
    clearAdminSession();
    router.replace("/admin/login");
  }

  if (!ready) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Checking session…</p>
      </main>
    );
  }

  return (
    <div className="min-h-[70vh] bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            <span className="font-bold text-gray-900 mr-2 hidden sm:inline">
              Admin
            </span>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {username ? (
              <span className="text-xs text-gray-500 hidden sm:inline">
                {username}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

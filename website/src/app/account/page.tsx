import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your Reel Cutter account.",
  robots: "noindex, nofollow",
};

interface License {
  license_key: string;
  tier: string;
  status: string;
  activated_at: string | null;
  created_at: string;
  hasHwid: boolean;
}

async function fetchLicenses(accessToken: string): Promise<License[]> {
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${serverUrl}/api/license/dashboard`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.success ? (data.licenses || []) : [];
  } catch {
    return [];
  }
}

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || "";
  const licenses = accessToken ? await fetchLicenses(accessToken) : [];

  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  const emailVerified = user.email_confirmed_at ? true : false;

  function tierBadgeColor(tier: string) {
    switch (tier) {
      case "pro":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "standard":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "basic":
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300";
    }
  }

  function statusBadge(status: string) {
    switch (status) {
      case "active":
        return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300">Active</span>;
      case "revoked":
        return <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-300">Revoked</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-300">{status}</span>;
    }
  }

  return (
    <section className="bg-white px-4 py-20 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Account
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Manage your Reel Cutter account settings.
        </p>

        {/* Account Info */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Account Information
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <span className="text-sm text-slate-600 dark:text-slate-400">Email</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{user.email}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <span className="text-sm text-slate-600 dark:text-slate-400">Member Since</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{createdAt}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Email Verified</span>
              <span className={`text-sm font-medium ${emailVerified ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                {emailVerified ? "Verified" : "Not Verified"}
              </span>
            </div>
          </div>
        </div>

        {/* Licenses Section */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Your Licenses
          </h2>
          {licenses.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              No licenses found. Purchase a plan to get your activation key.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {licenses.map((lic) => (
                <div
                  key={lic.license_key}
                  className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tierBadgeColor(lic.tier)}`}>
                        {lic.tier.toUpperCase()}
                      </span>
                      {statusBadge(lic.status)}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {lic.created_at
                        ? new Date(lic.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Activation Key</p>
                    <p className="mt-1 font-mono text-sm font-semibold tracking-wider text-slate-900 dark:text-white">
                      {lic.license_key}
                    </p>
                  </div>
                  {lic.hasHwid && (
                    <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                      Activated on a device
                    </p>
                  )}
                  {lic.activated_at && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Activated: {new Date(lic.activated_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Other Sections */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Downloads</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              View your downloaded installers.
            </p>
            <Link href="/download" className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Go to Downloads
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Support</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Get help with Reel Cutter.
            </p>
            <Link href="/support" className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              Get Support
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex items-center gap-4">
          <LogoutButton />
          <Link
            href="/"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </section>
  );
}

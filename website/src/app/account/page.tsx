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

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  const emailVerified = user.email_confirmed_at ? true : false;

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

        {/* Future Sections */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Purchases</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Coming soon. View your purchase history and receipts.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Licenses</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Coming soon. Manage your Reel Cutter licenses.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Downloads</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Coming soon. Access your downloaded installers.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-white">Support</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Coming soon. View your support tickets.
            </p>
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

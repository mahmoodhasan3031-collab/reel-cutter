export const metadata = {
  title: "Admin Login | Reel Cutter",
  robots: { index: false, follow: false },
};

import AdminLoginForm from "./AdminLoginForm";

export default function AdminLoginPage() {
  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Admin Sign In
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Restricted access. Sign in to review manual payments.
          </p>
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}

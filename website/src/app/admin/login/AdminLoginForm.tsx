"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_API } from "@/config/adminApi";
import {
  describeAdminError,
  AdminApiError,
} from "@/lib/adminApi";
import { setAdminSession } from "@/lib/adminSession";

interface LoginResponse {
  success?: boolean;
  token?: string;
  expires_in?: number;
  admin?: { username?: string };
  error?: { code?: string; message?: string };
}

export default function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);

    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(ADMIN_API.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.status === 401 || res.status === 400) {
        setError("Invalid username or password.");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
        return;
      }
      if (res.status === 503) {
        setError("Admin sign-in is not configured. Contact the operator.");
        return;
      }

      const data = (await res.json().catch(() => null)) as LoginResponse | null;
      if (!res.ok || !data?.success || !data.token) {
        throw new AdminApiError(
          res.status,
          data?.error?.code || "LOGIN_FAILED",
          data?.error?.message || "Sign-in failed. Please try again."
        );
      }

      const saved = setAdminSession(
        data.token,
        data.admin?.username || username.trim(),
        typeof data.expires_in === "number" ? data.expires_in : 1800
      );
      if (!saved) {
        setError(
          "Could not store your session. Enable cookies/storage and try again."
        );
        return;
      }

      router.replace("/admin");
    } catch (err) {
      setError(describeAdminError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="admin-username"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Username
        </label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          required
        />
      </div>
      <div>
        <label
          htmlFor="admin-password"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          required
        />
      </div>
      {error ? (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

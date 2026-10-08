import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PUBLIC_ENV } from "@/config/publicEnv";

/**
 * Create a Supabase client for use in Next.js Server Components, Route Handlers, and Server Actions.
 * Uses only the public anon key — never the service-role key.
 *
 * PUBLIC_ENV throws during a production build when NEXT_PUBLIC_SUPABASE_URL or
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, so the mock client below can only
 * ever be constructed outside production. The `process.env.NODE_ENV` guard is a
 * constant condition in a production build, which lets the bundler drop the
 * entire mock object from the shipped bundle.
 */
export async function createClient() {
  const url = PUBLIC_ENV.supabaseUrl;
  const key = PUBLIC_ENV.supabaseAnonKey;

  if (process.env.NODE_ENV !== "production" && (!url || !key)) {
    // Development-only mock: returns empty/default values so `next dev` works
    // before Supabase is configured. Never reachable in a production build.
    return {
      __mockClient: true,
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        exchangeCodeForSession: async () => ({ error: null }),
      },
    } as { __mockClient: boolean; auth: { getUser: () => Promise<{ data: { user: null }; error: null }>; getSession: () => Promise<{ data: { session: null }; error: null }>; exchangeCodeForSession: (code: string) => Promise<{ error: null }> } };
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

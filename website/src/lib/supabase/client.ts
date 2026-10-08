import { createBrowserClient } from "@supabase/ssr";
import { PUBLIC_ENV } from "@/config/publicEnv";

/**
 * Create a Supabase client for use in browser/client components.
 * Uses only the public anon key — never the service-role key.
 *
 * PUBLIC_ENV throws during a production build when NEXT_PUBLIC_SUPABASE_URL or
 * NEXT_PUBLIC_SUPABASE_ANON_KEY is missing, so the mock client below can only
 * ever be constructed outside production. The `process.env.NODE_ENV` guard is a
 * constant condition in a production build, which lets the bundler drop the
 * entire mock object from the shipped bundle.
 */
export function createClient() {
  const url = PUBLIC_ENV.supabaseUrl;
  const key = PUBLIC_ENV.supabaseAnonKey;

  if (process.env.NODE_ENV !== "production" && (!url || !key)) {
    // Development-only mock: returns empty/default values so `next dev` works
    // before Supabase is configured. Never reachable in a production build.
    return {
      __mockClient: true,
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        signUp: async () => ({ data: { user: null }, error: null }),
        signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
        signOut: async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        updateUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        exchangeCodeForSession: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    } as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key);
}

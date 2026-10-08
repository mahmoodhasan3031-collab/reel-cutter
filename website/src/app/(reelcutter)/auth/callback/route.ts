import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Local destination used when no safe `next` value was supplied. */
const DEFAULT_NEXT = "/account";

/**
 * Validates the `?next=` return destination (STEP 70).
 *
 * Only a single-slash, same-origin application path is accepted. Rejected:
 * absolute http(s) URLs, protocol-relative `//host`, backslash variants,
 * `@`-host values, and control characters (CR/LF header splitting).
 * Anything unsafe falls back to the signed-in account page.
 */
function safeNextPath(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  if (raw[0] !== "/") return DEFAULT_NEXT;
  if (raw.startsWith("//")) return DEFAULT_NEXT;
  if (raw.includes("\\") || raw.includes("@")) return DEFAULT_NEXT;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code < 32 || code === 127) return DEFAULT_NEXT;
  }
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}

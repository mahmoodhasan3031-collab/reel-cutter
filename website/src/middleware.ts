import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ADMIN_AUTH_COOKIE, isAdminAuthAuthorized } from "@/lib/adminAuthCookie";

/**
 * Server-side authorization for the `admin/(protected)` route group.
 * Mirrors: /admin, /admin/payments, /admin/payments/[id].
 * `/admin/login` is intentionally excluded (it must stay public).
 */
const ADMIN_PROTECTED = /^\/admin(\/payments(\/.*)?)?$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ADMIN_PROTECTED.test(pathname)) {
    const auth = request.cookies.get(ADMIN_AUTH_COOKIE)?.value;
    if (!isAdminAuthAuthorized(auth)) {
      const login = request.nextUrl.clone();
      login.pathname = "/admin/login";
      login.search = "";
      return NextResponse.redirect(login);
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

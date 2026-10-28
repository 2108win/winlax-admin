import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "__Host-wa_session";
const PUBLIC_PATHS = ["/login", "/api/auth/", "/api/health"];

/**
 * First gate only: no session cookie means no access. Every page and route
 * still validates the session against the database.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))) {
    return NextResponse.next();
  }
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  // Built from PUBLIC_URL: request.url is https://localhost:PORT behind nginx,
  // and Next rejects a relative Location from the proxy.
  return NextResponse.redirect(new URL("/login", process.env.PUBLIC_URL));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

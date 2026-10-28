export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Mutations must come from this site. request.nextUrl.origin is the internal
 * https://localhost:PORT behind nginx, so compare with the Host header instead.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

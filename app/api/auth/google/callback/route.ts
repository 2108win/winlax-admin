import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { createPendingLogin, recordFailure, takeOAuthState } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { env, publicUrl } from "@/lib/env";
import { verifiedEmailFromCode } from "@/lib/google";
import { clientIp } from "@/lib/security";

// A plain Response (not Response.redirect, whose headers are immutable) so Next
// can attach the cookies set above.
function back(path: string) {
  return new Response(null, { status: 303, headers: { Location: publicUrl(path).toString() } });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = await takeOAuthState();
  const code = params.get("code");
  const state = params.get("state") ?? "";
  if (!saved || !code || !safeEqual(state, saved.state)) return back("/login?error=state");

  let email: string;
  try {
    email = await verifiedEmailFromCode(code, saved.verifier);
  } catch (error) {
    console.error("Google login failed:", error);
    return back("/login?error=google");
  }

  if (email !== env.adminEmail) {
    await recordFailure(request, "google-email");
    await audit({ email, ip: clientIp(request), action: "login.denied", detail: { reason: "email" } });
    return back("/login?error=email");
  }

  await createPendingLogin(email);
  return back("/login/2fa");
}

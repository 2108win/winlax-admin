import { redirect } from "next/navigation";

import { saveOAuthState } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { googleAuthUrl } from "@/lib/google";

export async function GET() {
  const state = randomToken();
  const verifier = randomToken(48);
  await saveOAuthState(state, verifier);
  redirect(googleAuthUrl(state, verifier));
}

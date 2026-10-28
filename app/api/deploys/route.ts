import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { deployRuns } from "@/lib/server/history";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  return json({ runs: await deployRuns(200) });
}

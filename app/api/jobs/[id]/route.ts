import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { EXIT_MARKER, getJob } from "@/lib/server/jobs";
import { tailResponse } from "@/lib/server/sse";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const job = await getJob((await params).id);
  if (!job) return json({ error: "Không có tác vụ này." }, 404);
  return tailResponse([job.log_path], request.signal, { lines: 5000, stopMarker: EXIT_MARKER });
}

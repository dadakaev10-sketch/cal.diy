import { studioAccountRateLimit, validStudioOrigin } from "@calcom/features/auth/lib/studioAccountSecurity";
import { type NextRequest, NextResponse } from "next/server";

export function studioAccountResponse(message: string, status = 200) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function guardStudioAccountRequest(req: NextRequest, scope: string) {
  if (!validStudioOrigin(req)) return studioAccountResponse("forbidden_error", 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return studioAccountResponse("bad_request_error", 415);
  }
  // The trusted ingress overwrites this header; the application port must remain private.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await studioAccountRateLimit(scope, ip, 20))) {
    const res = studioAccountResponse("too_many_requests", 429);
    res.headers.set("Retry-After", "600");
    return res;
  }
  return null;
}

export async function readStudioAccountBody(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(chunk.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

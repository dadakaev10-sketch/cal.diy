import process from "node:process";
import { validStudioCsrf } from "@calcom/features/auth/lib/studioAccountSecurity";
import {
  completeStudioRegistration,
  requestStudioRegistration,
  studioRegistrationSchema,
} from "@calcom/features/auth/lib/studioRegistration";
import {
  guardStudioAccountRequest,
  readStudioAccountBody,
  studioAccountResponse,
} from "@lib/studioAccountRequest";
import { getStudioAdmin } from "@lib/studioAdmin";
import type { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["request", "complete", "admin"].includes(action))
    return studioAccountResponse("not_found_error", 404);
  if (process.env.STUDIO_REGISTRATION_ENABLED !== "true")
    return studioAccountResponse("not_found_error", 404);
  try {
    const denied = await guardStudioAccountRequest(req, `registration-${action}`);
    if (denied) return denied;
    const adminId = action === "admin" ? await getStudioAdmin(req) : null;
    if (action === "admin" && !adminId) return studioAccountResponse("forbidden_error", 403);
    const body: unknown = await readStudioAccountBody(req);
    if (action === "complete") {
      const parsed = studioRegistrationSchema.extend({ csrfToken: z.string() }).safeParse(body);
      if (!parsed.success) return studioAccountResponse("studio_registration_invalid", 400);
      if (!validStudioCsrf(parsed.data.csrfToken, req.cookies.get("calcom.csrf_token")?.value))
        return studioAccountResponse("forbidden_error", 403);
      const result = await completeStudioRegistration(parsed.data);
      return studioAccountResponse(result, result === "studio_registration_complete" ? 201 : 400);
    }
    const parsed = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        locale: z.enum(["de", "en"]),
        studioName: z.string().trim().min(2).max(100).optional(),
      })
      .safeParse(body);
    if (!parsed.success || (action === "admin" && !parsed.data.studioName))
      return studioAccountResponse("bad_request_error", 400);
    await requestStudioRegistration({
      email: parsed.data.email,
      locale: parsed.data.locale,
      ...(adminId ? { createdBy: adminId, studioName: parsed.data.studioName } : {}),
    });
    return studioAccountResponse("studio_registration_sent", 202);
  } catch {
    return studioAccountResponse("unexpected_error_try_again", 503);
  }
}

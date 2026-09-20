import { validStudioCsrf, validStudioPassword } from "@calcom/features/auth/lib/studioAccountSecurity";
import { resetStudioPassword } from "@calcom/features/auth/lib/studioPasswordRecovery";
import {
  guardStudioAccountRequest,
  readStudioAccountBody,
  studioAccountResponse,
} from "@lib/studioAccountRequest";
import type { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    const denied = await guardStudioAccountRequest(req, "reset-ip");
    if (denied) return denied;
    const parsed = z
      .object({
        csrfToken: z.string(),
        requestId: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().max(72).refine(validStudioPassword),
      })
      .safeParse(await readStudioAccountBody(req));
    if (!parsed.success) return studioAccountResponse("studio_password_requirements", 400);
    if (!validStudioCsrf(parsed.data.csrfToken, req.cookies.get("calcom.csrf_token")?.value)) {
      return studioAccountResponse("forbidden_error", 403);
    }
    if (!(await resetStudioPassword(parsed.data.requestId, parsed.data.password))) {
      return studioAccountResponse("request_is_expired", 400);
    }
    const response = studioAccountResponse("password_updated", 201);
    response.cookies.delete("calcom.csrf_token");
    return response;
  } catch {
    return studioAccountResponse("unexpected_error_try_again", 503);
  }
}

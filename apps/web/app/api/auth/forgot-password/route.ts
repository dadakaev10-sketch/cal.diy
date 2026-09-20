import { requestStudioPasswordRecovery } from "@calcom/features/auth/lib/studioPasswordRecovery";
import {
  guardStudioAccountRequest,
  readStudioAccountBody,
  studioAccountResponse,
} from "@lib/studioAccountRequest";
import type { NextRequest } from "next/server";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    const denied = await guardStudioAccountRequest(req, "recovery-ip");
    if (denied) return denied;
    const parsed = z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      })
      .safeParse(await readStudioAccountBody(req));
    if (!parsed.success) return studioAccountResponse("bad_request_error", 400);
    await requestStudioPasswordRecovery(parsed.data.email);
    return studioAccountResponse("password_reset_email_sent", 202);
  } catch {
    return studioAccountResponse("unexpected_error_try_again", 503);
  }
}

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";

export function studioTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function studioPasswordStamp(hash: string, secret: string) {
  return createHmac("sha256", secret).update(`studio-password:${hash}`).digest("hex");
}

export function validStudioPassword(password: string) {
  return (
    password.length >= 15 &&
    Buffer.byteLength(password, "utf8") <= 72 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function validStudioOrigin(request: Request) {
  const base = process.env.NEXTAUTH_URL;
  if (!base) return false;
  return request.headers.get("origin") === new URL(base).origin;
}

export function validStudioCsrf(submitted: unknown, cookie: string | undefined) {
  if (typeof submitted !== "string" || !cookie || !/^[a-f0-9]{64}$/.test(submitted)) return false;
  if (submitted.length !== cookie.length) return false;
  return timingSafeEqual(Buffer.from(submitted), Buffer.from(cookie));
}

export async function studioAccountRateLimit(scope: string, identity: string, limit: number) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw ErrorWithCode.Factory.InternalServerError("Authentication unavailable");
  const key = createHmac("sha256", secret).update(`studio-account:${scope}:${identity}`).digest("hex");
  const window = new Date(Math.floor(Date.now() / 600_000) * 600_000);
  const retention = new Date(Date.now() - 86_400_000);
  await prisma.$executeRaw`DELETE FROM "StudioAuthThrottle" WHERE "windowStart" < ${retention}`;
  const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "StudioAuthThrottle" ("key", "windowStart", "attempts") VALUES (${key}, ${window}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "StudioAuthThrottle"."windowStart" = EXCLUDED."windowStart"
        THEN LEAST("StudioAuthThrottle"."attempts" + 1, ${limit + 1}) ELSE 1 END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING "attempts"`;
  if (!rows[0]) throw ErrorWithCode.Factory.InternalServerError("Authentication unavailable");
  return rows[0].attempts <= limit;
}

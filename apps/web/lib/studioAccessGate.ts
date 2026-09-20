import { createHmac } from "node:crypto";
import process from "node:process";
import prisma from "@calcom/prisma";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPages = new Set(["/", "/auth/login", "/auth/error", "/auth/logout", "/register"]);
const publicAssets = new Set([
  "/api/logo",
  "/favicon.ico",
  "/icons/sprite.svg",
  "/site.webmanifest",
  "/service-worker.js",
  "/safari-pinned-tab.svg",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-256x256.png",
  "/cal-com-icon-white.svg",
]);
const authEndpoints = new Set([
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/callback/credentials",
  "/api/auth/error",
]);

export function studioRouteAccess(path: string, method: string) {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (["/auth/setup", "/api/auth/setup", "/api/auth/signup"].includes(normalized)) return "disabled";
  if (normalized === "/signup") return "register";
  if (authEndpoints.has(normalized) && ["GET", "POST", "HEAD"].includes(method)) return "public";
  if (
    ["GET", "HEAD"].includes(method) &&
    (publicPages.has(normalized) || publicAssets.has(normalized) || normalized.startsWith("/_next/static/"))
  ) {
    return "public";
  }
  return "private";
}

export async function studioAccessGate(req: NextRequest) {
  if (process.env.STUDIO_ACCESS_GATE_ENABLED !== "true") return null;
  const path = req.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const access = studioRouteAccess(path, req.method);
  if (access === "disabled") return NextResponse.json({ error: "Not available" }, { status: 404 });
  if (access === "register") return NextResponse.redirect(new URL("/register", req.url));
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  try {
    if (path === "/api/auth/callback/credentials" && req.method === "POST") {
      // The Coolify proxy replaces untrusted forwarded addresses; only that proxy can reach this container.
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const key = createHmac("sha256", secret).update(`studio-login:${ip}`).digest("hex");
      const window = new Date(Math.floor(Date.now() / 600_000) * 600_000);
      const retention = new Date(Date.now() - 86_400_000);
      await prisma.$executeRaw`DELETE FROM "StudioAuthThrottle" WHERE "windowStart" < ${retention}`;
      const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO "StudioAuthThrottle" ("key", "windowStart", "attempts") VALUES (${key}, ${window}, 1)
        ON CONFLICT ("key") DO UPDATE SET
          "attempts" = CASE WHEN "StudioAuthThrottle"."windowStart" = EXCLUDED."windowStart"
            THEN LEAST("StudioAuthThrottle"."attempts" + 1, 21) ELSE 1 END,
          "windowStart" = EXCLUDED."windowStart"
        RETURNING "attempts"`;
      if (!rows[0] || rows[0].attempts > 20) {
        return NextResponse.json(
          { error: "Too many sign-in attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": "600", "Cache-Control": "no-store" } }
        );
      }
    }
    if (access === "public") return null;
    const token = await getToken({
      req,
      secret,
      secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://"),
    });
    const userId = Number(token?.sub || token?.id);
    if (Number.isSafeInteger(userId) && userId > 0) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, locked: true },
      });
      if (user && !user.locked) return null;
    }
  } catch {
    return NextResponse.json(
      { error: "Service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (path.startsWith("/api/") || !["GET", "HEAD"].includes(req.method)) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  const login = new URL("/auth/login", req.url);
  login.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

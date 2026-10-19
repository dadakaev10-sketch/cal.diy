import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import { expireDeposits } from "@calcom/app-store/stripepayment/lib/expireDeposits";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = process.env.CRON_API_KEY;
  const provided = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cursor = Number(new URL(request.url).searchParams.get("cursor") || 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  return NextResponse.json(await expireDeposits(cursor), { headers: { "Cache-Control": "no-store" } });
}

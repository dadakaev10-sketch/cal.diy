import { webCallback, webGet, webPost } from "@lib/studioSocial/web";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
type Context = { params: Promise<{ action: string[] }> };
export async function GET(req: NextRequest, context: Context) {
  const { action } = await context.params;
  if (action.length === 2 && action[0] === "callback") return webCallback(req, action[1]);
  if (action.length === 1) return webGet(req, action[0]);
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
export async function POST(req: NextRequest, context: Context) {
  const { action } = await context.params;
  if (action.length === 2 && action[0] === "callback") return webCallback(req, action[1]);
  if (action.length === 1) return webPost(req, action[0]);
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

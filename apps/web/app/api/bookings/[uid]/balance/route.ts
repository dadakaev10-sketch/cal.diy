import { bookingBalance } from "@calcom/app-store/stripepayment/lib/bookingBalance";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ uid: string }> };
async function handle(request: Request, context: Context, mutate: boolean) {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (mutate && request.headers.get("origin") !== new URL(WEBAPP_URL).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { uid } = await context.params;
  if (!uid || uid.length > 100) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
  try {
    const action = mutate
      ? z.object({ action: z.enum(["link", "studio"]) }).parse(await request.json()).action
      : undefined;
    const result = await bookingBalance(uid, session.user.id, action);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ErrorWithCode && error.code === ErrorCode.NotFound ? 404 : 409;
    return NextResponse.json(
      { error: "Payment could not be updated. Refresh and check the payment status." },
      { status }
    );
  }
}
export const GET = (request: Request, context: Context) => handle(request, context, false);
export const POST = (request: Request, context: Context) => handle(request, context, true);

import { cancelUnpaidBooking } from "@calcom/app-store/stripepayment/lib/cancelUnpaidBooking";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  if (request.headers.get("origin") !== new URL(WEBAPP_URL).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { uid } = await context.params;
  if (!z.string().uuid().safeParse(uid).success) {
    return NextResponse.json({ error: "Invalid payment" }, { status: 400 });
  }
  try {
    return NextResponse.json(await cancelUnpaidBooking(uid), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ErrorWithCode && error.code === ErrorCode.NotFound ? 404 : 409;
    return NextResponse.json(
      { error: "Cancellation unavailable. Refresh and check payment status." },
      { status }
    );
  }
}

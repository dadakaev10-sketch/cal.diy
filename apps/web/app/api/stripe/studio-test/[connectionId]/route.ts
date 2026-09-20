import process from "node:process";
import { MerchantTestCheckoutService } from "@calcom/app-store/stripepayment/lib/MerchantTestCheckoutService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import prisma from "@calcom/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  if (process.env.MERCHANT_STRIPE_TEST_ENABLED !== "true") return new Response(null, { status: 404 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  // Enforce the limit while streaming; Content-Length alone is not trustworthy.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 262144) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const { connectionId } = await params;
    const service = new MerchantTestCheckoutService(
      prisma,
      process.env.MERCHANT_STRIPE_ENCRYPTION_KEY ?? "",
      process.env.NEXT_PUBLIC_WEBAPP_URL ?? ""
    );
    await service.webhook(connectionId, Buffer.concat(chunks).toString("utf8"), signature);
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof ErrorWithCode && [ErrorCode.BadRequest, ErrorCode.NotFound].includes(error.code))
      return new Response(null, { status: 400 });
    return new Response(null, { status: 503 });
  }
}

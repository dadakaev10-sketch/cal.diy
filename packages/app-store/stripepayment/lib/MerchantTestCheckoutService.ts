import { TeamAccessService } from "@calcom/features/teams/services/TeamAccessService";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import type { PrismaClient } from "@calcom/prisma/client";
import { MembershipRole } from "@calcom/prisma/enums";
import Stripe from "stripe";
import { z } from "zod";
import { decryptMerchantStripeCredentials } from "./merchantCredentials";
import { createMerchantPaymentQuote } from "./merchantPaymentQuote";

const inputSchema = z
  .object({
    id: z.string().uuid(),
    totalMinor: z.number().int().min(50).max(100000),
    prepaymentPercent: z.number().int().min(1).max(100),
  })
  .strict();
const checkoutSelect = {
  id: true,
  connectionId: true,
  createdByUserId: true,
  totalMinor: true,
  dueNowMinor: true,
  prepaymentPercent: true,
  currency: true,
  sessionId: true,
  paymentIntentId: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  updatedAt: true,
} as const;
const connectionSelect = { id: true, teamId: true, accountId: true, encryptedCredentials: true } as const;
const settingsPath = "/settings/my-account/studio-payments";

export class MerchantTestCheckoutService {
  constructor(
    private readonly db: PrismaClient,
    private readonly encryptionKey: string,
    private readonly origin: string,
    private readonly makeStripe = (key: string) =>
      new Stripe(key, {
        apiVersion: "2020-08-27",
        timeout: 10000,
        maxNetworkRetries: 1,
      })
  ) {}

  private async connection(connectionId: string) {
    const connection = await this.db.merchantStripeConnection.findUnique({
      where: { id: z.string().uuid().parse(connectionId) },
      select: connectionSelect,
    });
    if (!connection) throw ErrorWithCode.Factory.NotFound("merchant_stripe_test_failed");
    const credentials = decryptMerchantStripeCredentials(
      { teamId: connection.teamId, connectionId: connection.id },
      connection.encryptedCredentials,
      this.encryptionKey
    );
    if (credentials.accountId !== connection.accountId)
      throw ErrorWithCode.Factory.Forbidden("merchant_stripe_test_failed");
    return { connection, credentials, stripe: this.makeStripe(credentials.restrictedKey) };
  }

  async start(userId: number, teamId: number, input: unknown) {
    await new TeamAccessService(this.db).requireMembership(userId, teamId, [MembershipRole.OWNER]);
    const parsed = inputSchema.parse(input);
    const origin = new URL(this.origin);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    }
    const connection = await this.db.merchantStripeConnection.findUnique({
      where: { teamId },
      select: { id: true },
    });
    if (!connection) throw ErrorWithCode.Factory.NotFound("merchant_stripe_test_failed");
    const { stripe } = await this.connection(connection.id);
    const quote = createMerchantPaymentQuote({
      totalMinor: parsed.totalMinor,
      prepaymentPercent: parsed.prepaymentPercent,
      currency: "eur",
    });
    const checkout = await this.db.$transaction(
      async (tx) => {
        await new TeamAccessService(tx).requireMembership(userId, teamId, [MembershipRole.OWNER]);
        const existing = await tx.merchantStripeTestCheckout.findUnique({
          where: { id: parsed.id },
          select: checkoutSelect,
        });
        if (existing) {
          if (
            existing.connectionId !== connection.id ||
            existing.createdByUserId !== userId ||
            existing.totalMinor !== quote.totalMinor ||
            existing.prepaymentPercent !== quote.prepaymentPercent
          ) {
            throw ErrorWithCode.Factory.Forbidden("merchant_stripe_test_failed");
          }
          return existing;
        }
        const pending = await tx.merchantStripeTestCheckout.count({
          where: {
            connectionId: connection.id,
            status: { in: ["CREATING", "OPEN"] },
            expiresAt: { gt: new Date() },
          },
        });
        if (pending >= 3) throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_limit");
        return tx.merchantStripeTestCheckout.create({
          data: {
            id: parsed.id,
            connectionId: connection.id,
            createdByUserId: userId,
            totalMinor: quote.totalMinor,
            dueNowMinor: quote.dueNowMinor,
            prepaymentPercent: quote.prepaymentPercent,
            expiresAt: new Date(Date.now() + 35 * 60 * 1000),
          },
          select: checkoutSelect,
        });
      },
      { isolationLevel: "Serializable" }
    );
    if (
      !["CREATING", "OPEN"].includes(checkout.status) ||
      checkout.expiresAt.getTime() <= Date.now() + 60_000
    ) {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_expired");
    }
    try {
      const session = checkout.sessionId
        ? await stripe.checkout.sessions.retrieve(checkout.sessionId)
        : await stripe.checkout.sessions.create(
            {
              mode: "payment",
              payment_method_types: ["card"],
              client_reference_id: checkout.id,
              expires_at: Math.floor(checkout.expiresAt.getTime() / 1000),
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: "eur",
                    unit_amount: checkout.dueNowMinor,
                    product_data: {
                      name: "Studio payment TEST — no appointment",
                      description: `${checkout.prepaymentPercent}% deposit · total EUR ${(checkout.totalMinor / 100).toFixed(2)}`,
                    },
                  },
                },
              ],
              metadata: { testCheckoutId: checkout.id, connectionId: checkout.connectionId },
              payment_intent_data: {
                metadata: { testCheckoutId: checkout.id, connectionId: checkout.connectionId },
              },
              success_url: `${origin.origin}${settingsPath}?testCheckout=${checkout.id}`,
              cancel_url: `${origin.origin}${settingsPath}?testCheckout=${checkout.id}`,
            },
            { idempotencyKey: `merchant-test-checkout:${checkout.id}` }
          );
      if (
        session.livemode ||
        session.mode !== "payment" ||
        session.amount_total !== checkout.dueNowMinor ||
        session.currency !== "eur" ||
        session.client_reference_id !== checkout.id ||
        session.metadata?.connectionId !== connection.id ||
        session.metadata?.testCheckoutId !== checkout.id ||
        !session.url ||
        new URL(session.url).origin !== "https://checkout.stripe.com"
      ) {
        throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
      }
      await this.db.merchantStripeTestCheckout.updateMany({
        where: { id: checkout.id, connectionId: connection.id, status: "CREATING" },
        data: { sessionId: session.id, status: "OPEN" },
      });
      return { url: session.url };
    } catch {
      // Keep the same persisted ID for retries after ambiguous network failures.
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    }
  }

  async refresh(userId: number, teamId: number, checkoutId: string) {
    await new TeamAccessService(this.db).requireMembership(userId, teamId, [MembershipRole.OWNER]);
    const connection = await this.db.merchantStripeConnection.findUnique({
      where: { teamId },
      select: { id: true },
    });
    const checkout = await this.db.merchantStripeTestCheckout.findUnique({
      where: { id: z.string().uuid().parse(checkoutId) },
      select: checkoutSelect,
    });
    if (!connection || checkout?.connectionId !== connection.id)
      throw ErrorWithCode.Factory.Forbidden("merchant_stripe_test_failed");
    if (!checkout.sessionId) return { status: checkout.status };
    const { stripe } = await this.connection(connection.id);
    try {
      const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
      return await this.record(connection.id, checkout, session);
    } catch {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    }
  }

  private async record(
    connectionId: string,
    checkout: { id: string; sessionId: string | null; dueNowMinor: number; status: string },
    session: Stripe.Checkout.Session
  ) {
    if (
      session.livemode ||
      session.id !== checkout.sessionId ||
      session.client_reference_id !== checkout.id ||
      session.metadata?.testCheckoutId !== checkout.id ||
      session.metadata?.connectionId !== connectionId ||
      session.amount_total !== checkout.dueNowMinor ||
      session.currency !== "eur" ||
      session.mode !== "payment"
    ) {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    }
    let status = checkout.status;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (session.status === "complete" && session.payment_status === "paid" && paymentIntentId)
      status = "PAID";
    else if (session.status === "expired" && checkout.status !== "PAID") status = "EXPIRED";
    if (status === "PAID" || status === "EXPIRED") {
      await this.db.merchantStripeTestCheckout.updateMany({
        where: { id: checkout.id, connectionId, status: { not: "PAID" } },
        data: { status, paymentIntentId },
      });
    }
    const latest = await this.db.merchantStripeTestCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
      select: { status: true },
    });
    return { status: latest.status };
  }

  async webhook(connectionId: string, body: string, signature: string) {
    const { credentials, stripe } = await this.connection(connectionId);
    if (!credentials.webhookSecret) throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, credentials.webhookSecret);
    } catch {
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_signature_invalid");
    }
    if (event.livemode || event.account)
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_signature_invalid");
    if (
      ![
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      return;
    const eventSession = event.data.object as Stripe.Checkout.Session;
    if (!eventSession.metadata?.testCheckoutId) return;
    const checkout = await this.db.merchantStripeTestCheckout.findUnique({
      where: { id: eventSession.metadata.testCheckoutId },
      select: checkoutSelect,
    });
    if (!checkout || checkout.connectionId !== connectionId)
      throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    // A webhook can race the create response: returning an error asks Stripe to retry after persistence.
    if (!checkout.sessionId)
      throw new ErrorWithCode(ErrorCode.InternalServerError, "Checkout persistence pending");
    const session = await stripe.checkout.sessions.retrieve(checkout.sessionId);
    if (eventSession.id !== session.id) throw ErrorWithCode.Factory.BadRequest("merchant_stripe_test_failed");
    await this.record(connectionId, checkout, session);
  }
}

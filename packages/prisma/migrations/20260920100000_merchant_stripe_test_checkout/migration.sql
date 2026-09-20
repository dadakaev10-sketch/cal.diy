CREATE TABLE "MerchantStripeTestCheckout" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "createdByUserId" INTEGER NOT NULL,
  "totalMinor" INTEGER NOT NULL,
  "dueNowMinor" INTEGER NOT NULL,
  "prepaymentPercent" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'eur',
  "sessionId" TEXT,
  "paymentIntentId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantStripeTestCheckout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MerchantStripeTestCheckout_amount_check" CHECK (
    "totalMinor" BETWEEN 50 AND 100000 AND "dueNowMinor" BETWEEN 50 AND "totalMinor"
    AND "prepaymentPercent" BETWEEN 1 AND 100 AND "currency" = 'eur'
  ),
  CONSTRAINT "MerchantStripeTestCheckout_status_check" CHECK ("status" IN ('CREATING', 'OPEN', 'PAID', 'EXPIRED'))
);
CREATE UNIQUE INDEX "MerchantStripeTestCheckout_sessionId_key" ON "MerchantStripeTestCheckout"("sessionId");
CREATE INDEX "MerchantStripeTestCheckout_connectionId_createdAt_idx" ON "MerchantStripeTestCheckout"("connectionId", "createdAt");
ALTER TABLE "MerchantStripeTestCheckout" ADD CONSTRAINT "MerchantStripeTestCheckout_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "MerchantStripeConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

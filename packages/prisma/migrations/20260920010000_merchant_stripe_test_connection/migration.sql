CREATE TABLE "MerchantStripeConnection" (
    "id" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "encryptedCredentials" JSONB NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchantStripeConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MerchantStripeConnection_teamId_key" ON "MerchantStripeConnection"("teamId");
ALTER TABLE "MerchantStripeConnection" ADD CONSTRAINT "MerchantStripeConnection_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

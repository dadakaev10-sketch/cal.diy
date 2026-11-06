CREATE TABLE "StudioCustomerProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "sourceEmail" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudioCustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudioCustomerProfile_userId_sourceEmail_key" ON "StudioCustomerProfile"("userId","sourceEmail");
CREATE UNIQUE INDEX "StudioCustomerProfile_userId_email_key" ON "StudioCustomerProfile"("userId","email");
CREATE INDEX "StudioCustomerProfile_userId_idx" ON "StudioCustomerProfile"("userId");

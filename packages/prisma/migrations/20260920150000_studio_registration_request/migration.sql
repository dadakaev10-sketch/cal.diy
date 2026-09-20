CREATE TABLE "StudioRegistrationRequest" (
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'de',
  "studioName" TEXT,
  "createdBy" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioRegistrationRequest_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "StudioRegistrationRequest_email_idx" ON "StudioRegistrationRequest"("email");
CREATE INDEX "StudioRegistrationRequest_expiresAt_idx" ON "StudioRegistrationRequest"("expiresAt");

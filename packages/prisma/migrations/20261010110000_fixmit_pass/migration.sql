CREATE TABLE "FixmitPass" (
 "requestId" TEXT PRIMARY KEY,
 "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "orderId" TEXT UNIQUE,
 "captureId" TEXT UNIQUE,
 "status" TEXT NOT NULL DEFAULT 'NEW',
 "accessUntil" TIMESTAMP(3),
 "checkedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "FixmitPass_userId_createdAt_idx" ON "FixmitPass"("userId", "createdAt");

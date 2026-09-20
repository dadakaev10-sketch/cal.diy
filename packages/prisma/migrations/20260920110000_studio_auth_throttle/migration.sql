CREATE TABLE "StudioAuthThrottle" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL CHECK ("attempts" BETWEEN 1 AND 21)
);
CREATE INDEX "StudioAuthThrottle_windowStart_idx" ON "StudioAuthThrottle"("windowStart");

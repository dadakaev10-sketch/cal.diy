CREATE TABLE "StudioProGrant" (
  "userId" INTEGER NOT NULL PRIMARY KEY,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT NOT NULL,
  CONSTRAINT "StudioProGrant_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Freeze the founding cohort at the owner's request, independently of launch date.
INSERT INTO "StudioProGrant" ("userId", "reason")
SELECT id, 'founding_studio_2026_11_19'
FROM users
WHERE created <= TIMESTAMP '2026-11-19 01:56:07.000'
ON CONFLICT ("userId") DO NOTHING;

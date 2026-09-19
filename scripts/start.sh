#!/bin/sh
set -eu

: "${DATABASE_HOST:?DATABASE_HOST must be configured}"
: "${DATABASE_URL:?DATABASE_URL must be configured}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET must be configured}"
: "${CALENDSO_ENCRYPTION_KEY:?CALENDSO_ENCRYPTION_KEY must be configured}"

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

scripts/wait-for-it.sh "$DATABASE_HOST" --strict -- echo "database is up"
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma
npx ts-node --transpile-only /calcom/scripts/seed-app-store.ts
exec yarn start

# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:20 AS dependency-inputs
WORKDIR /calcom
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY apps ./apps
COPY packages ./packages
COPY example-apps ./example-apps
COPY scripts/docker-dependency-inputs.cjs ./scripts/docker-dependency-inputs.cjs
RUN node scripts/docker-dependency-inputs.cjs /dependencies

FROM --platform=$BUILDPLATFORM node:20 AS dependencies
WORKDIR /calcom
RUN corepack enable
COPY --from=dependency-inputs /dependencies/ ./
COPY .yarn ./.yarn
COPY .yarnrc.yml ./
RUN --mount=type=cache,id=fixmit-yarn,target=/calcom/.yarn/cache,sharing=locked \
    YARN_HTTP_TIMEOUT=1200000 yarn install --immutable

FROM dependencies AS prebuild
## If we want to read any ENV variable from .env file, we need to first accept and pass it as an argument to the Dockerfile
ARG NEXT_PUBLIC_LICENSE_CONSENT
ARG NEXT_PUBLIC_WEBSITE_TERMS_URL
ARG NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
ARG CALCOM_TELEMETRY_DISABLED
ARG DATABASE_URL
ARG NEXTAUTH_SECRET=secret
ARG CALENDSO_ENCRYPTION_KEY=secret
ARG MAX_OLD_SPACE_SIZE=6144
ARG NEXT_PUBLIC_API_V2_URL
ARG CSP_POLICY
ARG NEXT_PUBLIC_DISABLE_SIGNUP=true
ARG NEXT_PUBLIC_APP_NAME=Fixmit
ARG NEXT_PUBLIC_SENDGRID_SENDER_NAME=Fixmit

## We need these variables as required by Next.js build to create rewrites
ARG NEXT_PUBLIC_SINGLE_ORG_SLUG
ARG ORGANIZATIONS_ENABLED

ENV NEXT_PUBLIC_WEBAPP_URL=http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER \
  NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
  NEXT_PUBLIC_SENDGRID_SENDER_NAME=$NEXT_PUBLIC_SENDGRID_SENDER_NAME \
  NEXT_PUBLIC_DISABLE_SIGNUP=$NEXT_PUBLIC_DISABLE_SIGNUP \
  NEXT_PUBLIC_API_V2_URL=$NEXT_PUBLIC_API_V2_URL \
  NEXT_PUBLIC_LICENSE_CONSENT=$NEXT_PUBLIC_LICENSE_CONSENT \
  NEXT_PUBLIC_WEBSITE_TERMS_URL=$NEXT_PUBLIC_WEBSITE_TERMS_URL \
  NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL=$NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL \
  CALCOM_TELEMETRY_DISABLED=$CALCOM_TELEMETRY_DISABLED \
  DATABASE_URL=$DATABASE_URL \
  DATABASE_DIRECT_URL=$DATABASE_URL \
  NEXTAUTH_SECRET=${NEXTAUTH_SECRET} \
  CALENDSO_ENCRYPTION_KEY=${CALENDSO_ENCRYPTION_KEY} \
  NEXT_PUBLIC_SINGLE_ORG_SLUG=$NEXT_PUBLIC_SINGLE_ORG_SLUG \
  ORGANIZATIONS_ENABLED=$ORGANIZATIONS_ENABLED \
  NODE_OPTIONS=--max-old-space-size=${MAX_OLD_SPACE_SIZE} \
  BUILD_STANDALONE=true \
  CSP_POLICY=$CSP_POLICY

COPY package.json yarn.lock .yarnrc.yml playwright.config.ts turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY --from=dependency-inputs /build-sources/apps/web ./apps/web
COPY apps/api/v2 ./apps/api/v2
COPY packages ./packages
RUN yarn turbo run post-install --force
RUN yarn workspace @calcom/trpc run build
RUN yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
FROM prebuild AS builder
COPY apps/web/next.config.ts ./apps/web/next.config.ts
COPY apps/web/app/favicon.ico ./apps/web/app/favicon.ico
COPY apps/web/public ./apps/web/public
RUN yarn --cwd apps/web workspace @calcom/web run copy-app-store-static
RUN --mount=type=cache,id=fixmit-next,target=/calcom/apps/web/.next/cache,sharing=locked \
    yarn --cwd apps/web workspace @calcom/web run build
RUN rm -rf node_modules/.cache .yarn/cache

FROM node:20 AS builder-two

WORKDIR /calcom
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000

ENV NODE_ENV=production

COPY package.json .yarnrc.yml turbo.json i18n.json ./
COPY .yarn ./.yarn
COPY --from=builder /calcom/yarn.lock ./yarn.lock
COPY --from=builder /calcom/node_modules ./node_modules
COPY --from=builder /calcom/packages ./packages
COPY --from=builder /calcom/apps/web ./apps/web
COPY --from=builder /calcom/packages/prisma/schema.prisma ./prisma/schema.prisma
COPY scripts scripts
RUN chmod +x scripts/*

# Save value used during this build stage. If NEXT_PUBLIC_WEBAPP_URL and BUILT_NEXT_PUBLIC_WEBAPP_URL differ at
# run-time, then start.sh will find/replace static values again.
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL

RUN scripts/replace-placeholder.sh http://NEXT_PUBLIC_WEBAPP_URL_PLACEHOLDER ${NEXT_PUBLIC_WEBAPP_URL}

FROM node:20 AS runner

WORKDIR /calcom
RUN corepack enable

RUN apt-get update && apt-get install -y --no-install-recommends netcat-openbsd wget && rm -rf /var/lib/apt/lists/*

COPY --from=builder-two /calcom ./
ARG NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
ENV NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL \
  BUILT_NEXT_PUBLIC_WEBAPP_URL=$NEXT_PUBLIC_WEBAPP_URL

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --retries=5 \
  CMD wget --spider http://localhost:3000 || exit 1

CMD ["/calcom/scripts/start.sh"]

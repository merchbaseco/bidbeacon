# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache libc6-compat && corepack enable

FROM base AS deps
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN --mount=type=secret,id=merchbase_npm_token \
  set -eux; \
  if [ -f /run/secrets/merchbase_npm_token ]; then \
    printf "MERCHBASE_NPM_TOKEN=%s\n" "$(cat /run/secrets/merchbase_npm_token)" > .env; \
  fi; \
  yarn install --immutable; \
  rm -f .env

FROM deps AS build
COPY . .
RUN --mount=type=secret,id=merchbase_npm_token \
  set -eux; \
  if [ -f /run/secrets/merchbase_npm_token ]; then \
    printf "MERCHBASE_NPM_TOKEN=%s\n" "$(cat /run/secrets/merchbase_npm_token)" > .env; \
  fi; \
  yarn build; \
  rm -f .env

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN apk add --no-cache dumb-init && corepack enable \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/yarn.lock ./yarn.lock
COPY --from=deps /app/.yarn ./.yarn
COPY --from=deps /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER nodejs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(res=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]


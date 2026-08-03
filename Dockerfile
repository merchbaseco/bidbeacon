# syntax=docker/dockerfile:1.10
FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json bun.lock bunfig.toml .npmrc ./
RUN --mount=type=secret,id=hugeicons_license_key,env=HUGEICONS_LICENSE_KEY,required=true \
    --mount=type=secret,id=merchbase_npm_token,env=MERCHBASE_NPM_TOKEN,required=true \
    bun install --frozen-lockfile

FROM deps AS build
ARG VITE_CLERK_PUBLISHABLE
COPY . .
RUN export VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE" && \
    bun run build && \
    bun run build:dashboard

# Production dependencies only - prune dev deps from node_modules
FROM deps AS prod-deps
RUN --mount=type=secret,id=hugeicons_license_key,env=HUGEICONS_LICENSE_KEY,required=true \
    --mount=type=secret,id=merchbase_npm_token,env=MERCHBASE_NPM_TOKEN,required=true \
    bun install --frozen-lockfile --production

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache dumb-init \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nodejs

COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

USER nodejs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(res=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# Caddy with dashboard static files
FROM caddy:alpine AS caddy
COPY --from=build /app/dist/dashboard /srv
EXPOSE 80

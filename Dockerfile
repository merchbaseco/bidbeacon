FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
ARG HUGEICONS_LICENSE_KEY
COPY package.json bun.lock bunfig.toml .npmrc ./
RUN : > .env && \
    if [ -n "$HUGEICONS_LICENSE_KEY" ]; then \
      printf "HUGEICONS_LICENSE_KEY=%s\n" "$HUGEICONS_LICENSE_KEY" >> .env; \
    fi && \
    bun install --frozen-lockfile && \
    rm -f .env

FROM deps AS build
ARG HUGEICONS_LICENSE_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
COPY . .
RUN : > .env && \
    { \
      [ -n "$HUGEICONS_LICENSE_KEY" ] && printf "HUGEICONS_LICENSE_KEY=%s\n" "$HUGEICONS_LICENSE_KEY"; \
      [ -n "$VITE_CLERK_PUBLISHABLE_KEY" ] && printf "VITE_CLERK_PUBLISHABLE_KEY=%s\n" "$VITE_CLERK_PUBLISHABLE_KEY"; \
    } >> .env && \
    bun run build && \
    bun run build:dashboard && \
    rm -f .env

# Production dependencies only - prune dev deps from node_modules
FROM deps AS prod-deps
RUN bun install --frozen-lockfile --production

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

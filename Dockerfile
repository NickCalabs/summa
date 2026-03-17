FROM node:22-alpine AS base
RUN corepack enable pnpm

# --- deps ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN npx esbuild src/lib/db/migrate.ts --bundle --platform=node --outfile=.next/standalone/migrate.js --external:postgres

# --- runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy migration files
COPY --from=builder /app/src/lib/db/migrations ./migrations

# Copy startup script
COPY --from=builder /app/start.sh ./start.sh
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

CMD ["sh", "start.sh"]

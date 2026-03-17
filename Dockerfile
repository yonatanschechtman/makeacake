# ── Stage 1: install dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for linux (needed at runtime)
RUN npx prisma generate

RUN npm run build

# ── Stage 3: production image ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + generated client
# (client is generated to app/generated/prisma per schema.prisma output setting)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/app/generated ./app/generated

# Install prisma CLI for running migrations at startup
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

# Cloud Run sets PORT env var; Next.js standalone reads it automatically
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Run migrations then start the app
# Use direct node path to prisma since .bin symlinks aren't in standalone output
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy || true && node server.js"]

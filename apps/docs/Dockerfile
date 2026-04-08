FROM node:24-alpine AS base

# ── Builder ────────────────────────────────────────────────────────────────────
FROM base AS builder

RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

RUN npm install -g turbo@^2
COPY . .

# Prune the monorepo to only what @scrivr/docs needs
RUN turbo prune @scrivr/docs --docker

# turbo prune doesn't include root config files — copy them manually
RUN cp tsconfig.base.json out/full/tsconfig.base.json

# ── Installer ─────────────────────────────────────────────────────────────────
FROM base AS installer

RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
ENV COREPACK_DISABLE_DOWNLOAD_SIGNATURE_CHECK=1

# Install deps — skip postinstall scripts since source files aren't copied yet
# (fumadocs-mdx postinstall needs source.config.ts which only exists in the full source)
COPY --from=builder /app/out/json/ .
RUN pnpm install --ignore-scripts

# Copy full source, run postinstall now that source.config.ts is available, then build
COPY --from=builder /app/out/full/ .
RUN pnpm --filter @scrivr/docs run postinstall
RUN pnpm turbo run build --filter=@scrivr/docs...

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

RUN apk update && apk add --no-cache dumb-init

WORKDIR /app

# Don't run as root
RUN addgroup --system --gid 1001 scrivr
RUN adduser --system --uid 1001 scrivr

# Copy built output from installer
COPY --from=installer /app/apps/docs/.output ./.output

USER scrivr

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

CMD ["dumb-init", "node", ".output/server/index.mjs"]

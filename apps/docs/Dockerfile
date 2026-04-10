FROM node:24-alpine AS base

FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm -g install turbo@^2

COPY . .
RUN turbo prune @scrivr/docs --docker

FROM base AS installer
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
ENV COREPACK_DISABLE_DOWNLOAD_SIGNATURE_CHECK=1

RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY --from=builder /app/out/json/ .
RUN pnpm install

COPY --from=builder /app/out/full/ .
RUN pnpm turbo run build --filter=@scrivr/docs...

FROM node:24-alpine AS runner
WORKDIR /app

RUN apk add --no-cache dumb-init

RUN addgroup --system --gid 1001 scrivr
RUN adduser --system --uid 1001 scrivr
USER scrivr
COPY --from=installer /app .

ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0
EXPOSE 3000

CMD ["dumb-init", "node", "apps/docs/.output/server/index.mjs"]

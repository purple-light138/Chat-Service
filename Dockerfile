FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/server/ apps/server/
COPY apps/web/ apps/web/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build packages and apps
RUN pnpm build

# ---- Production image ----
FROM node:22-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.11.0 --activate

# Copy workspace config for pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/server/package.json apps/server/package.json
COPY apps/server/drizzle/ apps/server/drizzle/

# Install production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/apps/server/dist/ apps/server/dist/
COPY --from=builder /app/apps/web/dist/ apps/web/dist/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]

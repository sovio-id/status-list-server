FROM oven/bun:1.3.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/config/package.json ./packages/config/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.2-alpine AS runner
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/packages/db/src/migrations ./dist/migrations

EXPOSE 3000
CMD ["bun", "run", "dist/index.mjs"]
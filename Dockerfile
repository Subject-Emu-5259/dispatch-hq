# Dispatch HQ — Render deployment image.
# The combined server must run under Bun (as it did on Zo): the compiled
# output is ESM that references __dirname, which crashes under Node
# ("ReferenceError: __dirname is not defined in ES module scope") but works
# under Bun. Node 22 is kept in the image for corepack/pnpm and the build.
FROM node:22-bookworm-slim

RUN npm install -g bun@1 && corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
# Batch 1 (P1-M1): ALWAYS clean before compiling. dist/ is gitignored, so a
# build context carrying a previous dist/ used to silently resurrect deleted
# routers (the Oct 25 gate batch deleted missions/stations/units routers that
# were still importable from a stale dist/serve-combined.js). A stale dist/
# must never decide what ships.
RUN rm -rf apps/web/dist servers/game-server/dist \
 && pnpm --filter "@dispatch-hq/web..." build \
 && pnpm --filter "@dispatch-hq/game-server..." build

ENV NODE_ENV=production
EXPOSE 3001

# Apply DB migrations (idempotent), then serve static + API + WS on $PORT
# (config.ts reads PORT; Render injects it).
CMD ["sh", "-c", "cd servers/game-server && bun scripts/migrate.mjs && bun run dist/serve-combined.js"]

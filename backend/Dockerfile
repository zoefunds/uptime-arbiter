FROM node:20-slim AS base
WORKDIR /app
# Prisma's bundled schema-engine binary needs a real OpenSSL on Debian slim —
# without this it fails with an opaque "Schema engine error:" at migrate/
# generate time, since the image otherwise has no libssl at all.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# fly.toml's [processes] block selects which of these two entrypoints each
# machine runs; both ship in the same image so there is one build to keep
# in sync.
CMD ["node", "dist/server.js"]

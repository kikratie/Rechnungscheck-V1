# =============================================================
# Ki2Go Accounting — Production Dockerfile (Multi-Stage Build)
# =============================================================

# Stage 1: Install dependencies and build all workspaces
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace package files first (for layer caching)
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY shared/ shared/
COPY server/ server/
COPY client/ client/
COPY prisma/ prisma/
COPY tsconfig.base.json ./

# Generate Prisma client BEFORE build (server needs types)
RUN npx prisma generate --schema prisma/schema.prisma

# Build order: shared → server → client
RUN npm run build

# =============================================================
# Stage 2: Production runtime (minimal image)
# =============================================================
FROM node:22-alpine AS production

# Install native dependencies for pdf-parse, sharp, mupdf
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

# Install production dependencies only
RUN npm ci --omit=dev

# Rebuild native modules (sharp, mupdf) for Alpine
RUN npm rebuild sharp || true

# Copy built artifacts
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/client/dist client/dist
COPY --from=builder /app/prisma prisma/
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma node_modules/@prisma

# Cleanup build tools
RUN apk del python3 make g++ 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run migrations then start server
CMD ["node", "server/dist/index.js"]

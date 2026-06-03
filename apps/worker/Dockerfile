# UDTL FleetHunt polling worker → deploys to Railway
# Multi-stage build keeps the runtime image small.

FROM node:22-alpine AS builder
WORKDIR /repo

# Copy the monorepo so npm workspaces resolves @udtl/db locally.
COPY package*.json ./
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

RUN npm install --workspaces --include-workspace-root
RUN npm run build -w @udtl/worker

# ---- Runtime image ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /repo/package*.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /repo/apps/worker/dist ./apps/worker/dist
COPY --from=builder /repo/packages/db ./packages/db

USER node
CMD ["node", "--enable-source-maps", "apps/worker/dist/index.js"]

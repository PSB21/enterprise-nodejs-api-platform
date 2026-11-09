# API and event worker image. Build from the repository root, because this is a monorepo:
#   docker build -f apps/api/Dockerfile -t ams-api .
# The same image runs the worker with: node dist/worker.js

# ---- Install every dependency (including dev tools needed to build) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@ams/api --include-workspace-root=false

# ---- Compile TypeScript and generate the Prisma client ----
FROM deps AS build
WORKDIR /app
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN npm run build --workspace=@ams/api

# ---- Production dependencies only: no TypeScript, Jest or Prisma CLI ----
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@ams/api --include-workspace-root=false --omit=dev

# ---- Runtime: the compiled code and production dependencies ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist

WORKDIR /app/apps/api
# Never run as root inside the container.
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:${PORT:-5000}/api/v1/health || exit 1
CMD ["node", "dist/server.js"]

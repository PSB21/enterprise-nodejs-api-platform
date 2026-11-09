# Dashboard image. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:5000 -t ams-web .
# API_URL is read at build time: Next.js writes its /api rewrite into the build output.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@ams/web --include-workspace-root=false

FROM deps AS build
WORKDIR /app
ARG API_URL=http://api:5000
ENV API_URL=${API_URL} NEXT_TELEMETRY_DISABLED=1
COPY apps/web apps/web
RUN npm run build --workspace=@ams/web

# The standalone output contains a minimal server and only the dependencies it uses.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/login > /dev/null || exit 1
CMD ["node", "apps/web/server.js"]

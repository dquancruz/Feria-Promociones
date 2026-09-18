# Build context is the monorepo root, e.g.:
#   docker build -f apps/frontend/Dockerfile -t feria-frontend .

FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace=@feria/frontend --workspace=@feria/shared --include-workspace-root
COPY apps/frontend apps/frontend
COPY packages/shared packages/shared
# Build-time: baked into the bundle. Empty means the app's default (10 minutes).
ARG VITE_IDLE_TIMEOUT_MIN
RUN npm run build -w apps/frontend

FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /repo/apps/frontend/dist ./dist
COPY apps/frontend/server.mjs ./server.mjs
ENV PORT=4173
EXPOSE 4173
USER node
# API_PROXY_TARGET (e.g. http://backend.railway.internal:4000) is read at runtime.
CMD ["node", "server.mjs"]

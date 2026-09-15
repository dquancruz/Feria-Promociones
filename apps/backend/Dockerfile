# Build context is the monorepo root, e.g.:
#   docker build -f apps/backend/Dockerfile -t feria-backend .

FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace=@feria/backend --workspace=@feria/shared --include-workspace-root
COPY apps/backend apps/backend
COPY packages/shared packages/shared
RUN npm run build -w apps/backend

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/backend/package.json ./package.json
COPY --from=build /repo/apps/backend/dist ./dist
COPY --from=build /repo/apps/backend/migrations ./migrations
COPY --from=build /repo/node_modules ./node_modules
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/index.js"]

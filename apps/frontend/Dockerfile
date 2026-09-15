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
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w apps/frontend

FROM node:20-alpine AS run
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /repo/apps/frontend/dist ./dist
ENV PORT=4173
EXPOSE 4173
CMD ["sh", "-c", "serve -s dist -l ${PORT}"]

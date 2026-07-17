# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

WORKDIR /app

# better-sqlite3 may need to compile when a matching musl prebuild is unavailable.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web

RUN npm run build:server \
    && npm run build:web \
    && npm prune --omit=dev

FROM node:22-alpine AS api

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_URL=file:./data/mcp-debug.db \
    DB_DIALECT=sqlite

RUN apk add --no-cache dumb-init

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist

RUN mkdir -p /app/apps/server/data && chown -R node:node /app/apps/server/data

USER node

EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/server/dist/index.js"]

FROM nginx:1.27-alpine AS web

COPY deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1


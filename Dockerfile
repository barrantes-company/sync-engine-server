# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY webpack.config.js ./
COPY server.js db.js pubsub-routing.js pubsub-service.js bridge-security.js ws-bridge.js extension_worker.js ./
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /var/lib/sync-engine/data /var/lib/sync-engine/uploads \
  && chown -R node:node /var/lib/sync-engine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DISABLE_LOCAL_TLS=true \
    DATA_DIR=/var/lib/sync-engine/data \
    UPLOADS_DIR=/var/lib/sync-engine/uploads

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server.js db.js pubsub-routing.js pubsub-service.js bridge-security.js ws-bridge.js extension_worker.js ./
COPY --chown=node:node public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/status').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","server.js"]

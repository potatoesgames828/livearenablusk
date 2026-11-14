# syntax=docker/dockerfile:1.7
# LIVE ARENA — imagem multi-alvo do monorepo.
#   docker build -f infrastructure/docker/Dockerfile --target api -t live-arena/api .
# Alvos: api, worker, game-runner, realtime, connector, stream-manager, web, migrate

ARG NODE_VERSION=22.12.0
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Opcional: CA de proxy corporativo via BuildKit secret (não fica na imagem):
#   docker build --secret id=extra_ca,src=/caminho/ca.pem ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm install -g pnpm@10.28.0 && pnpm --version
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/game-runner/package.json apps/game-runner/
COPY apps/realtime/package.json apps/realtime/
COPY apps/connector/package.json apps/connector/
COPY apps/stream-manager/package.json apps/stream-manager/
COPY apps/web/package.json apps/web/
COPY packages packages
COPY games games
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    find packages games -type f ! -name package.json -delete && \
    pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_REALTIME_URL=http://localhost:4001
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm rebuild && pnpm db:generate && pnpm build:packages && \
    for a in api worker game-runner realtime connector stream-manager; do (cd apps/$a && npx tsc -p tsconfig.json); done && \
    (cd apps/web && NODE_ENV=production npx next build)
# Remove dependências de desenvolvimento para as imagens de runtime.
RUN pnpm prune --prod --ignore-scripts || true

# ---------- runtime Node genérico (usuário sem privilégios) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /repo /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime AS api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:4000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

FROM runtime AS realtime
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:4001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/realtime/dist/main.js"]

FROM runtime AS worker
ENV HEALTH_HOST=0.0.0.0
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:9101/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/worker/dist/main.js"]

FROM runtime AS game-runner
ENV HEALTH_HOST=0.0.0.0
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:9102/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/game-runner/dist/main.js"]

FROM runtime AS connector
ENV HEALTH_HOST=0.0.0.0
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:9103/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/connector/dist/main.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS stream-manager
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium HEALTH_HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates openssl ffmpeg chromium fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /repo /app
RUN mkdir -p /app/recordings && chown node:node /app/recordings
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:9104/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/stream-manager/dist/main.js"]

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# Usa o estágio de build (inclui a CLI do Prisma, removida das imagens de runtime).
FROM build AS migrate
CMD ["sh", "-c", "cd packages/database && npx prisma migrate deploy && node dist/seed.js"]

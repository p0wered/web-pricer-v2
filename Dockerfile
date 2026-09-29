# syntax=docker/dockerfile:1

# ---- Зависимости (со слоем кэша по package*.json) ----
# --ignore-scripts: нативные модули (better-sqlite3) идут с готовыми бинарниками в пакете,
# собирать их из исходников не нужно — и в образе для этого нет компилятора.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# ---- Сборка фронтенда ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- Рантайм: сервер запускается из TS-исходников (нативный type stripping Node 24) ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production \
    DATA_DIR=/app/data
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace @webpricer/server && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/webpricer.sh /usr/local/bin/webpricer
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/webpricer

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "apps/server/src/main.ts"]

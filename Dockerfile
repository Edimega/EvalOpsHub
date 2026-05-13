FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS web
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run start -w @evalops/web"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["sh", "-c", "npm run db:migrate && npm run start -w @evalops/worker"]

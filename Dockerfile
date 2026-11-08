# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --include=dev --no-audit --no-fund \
    && test -x node_modules/.bin/next

COPY . .

ARG NEXT_PUBLIC_IDMS_API_URL=/api/v1
ARG IDMS_API_INTERNAL_URL=http://api:8000
ENV NEXT_PUBLIC_IDMS_API_URL=$NEXT_PUBLIC_IDMS_API_URL
ENV IDMS_API_INTERNAL_URL=$IDMS_API_INTERNAL_URL

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]

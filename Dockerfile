# Single-service image: the API also serves the built web app (SERVE_CLIENT=true).
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN cd server && npm ci && cd ../client && npm ci
COPY server/ ./server/
COPY client/ ./client/
RUN cd server && npm run build && npm prune --omit=dev
RUN cd client && npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production PORT=5000 SERVE_CLIENT=true DB_DIR=/app/server/data
WORKDIR /app/server
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/dist ./dist
COPY server/package.json ./
COPY --from=builder /app/client/dist /app/client/dist
RUN mkdir -p /app/server/data && chown -R node:node /app/server/data
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/healthz || exit 1
CMD ["node", "dist/server.js"]

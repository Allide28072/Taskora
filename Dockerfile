# THE FLASH — production image.
#
# One stage builds the client, the second runs the API, which serves both the
# built files from dist/ and the JSON API. The result is a single container on
# a single port.
#
#   docker build -t the-flash .
#   docker run --rm -p 3001:3001 \
#     -e SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
#     -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a-long-password' \
#     -v theflash-data:/app/data the-flash
#
# Node 22.13+ / 23.4+ is required: the API uses the built-in node:sqlite, which
# only stops needing --experimental-sqlite from those versions.

# ── build the client ────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so a source edit does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/data

# Production dependencies only — the client build needs none of them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The API, plus the client it serves.
COPY server ./server
COPY --from=build /app/dist ./dist
COPY .env.example ./.env.example

# The database lives here. Mount a volume to keep it across container runs.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/server.js"]

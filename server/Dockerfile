# The recipe for the server image. Build (from server/):
#   docker build -t fitbuddy-server:dev .
# Each instruction = one cached layer. Docker reuses a layer until
# something it depends on changes, so slow + rarely-changing steps go first.

# Base: Node 24 on Debian (slim = no compilers/docs, smaller + fewer CVEs).
# Exact version pinned: the image you test is the image you ship.
FROM node:24.22.0-trixie-slim

WORKDIR /app

# Production mode for node + npm (also skips devDependencies).
ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# 1. Dependencies. Only the files `npm ci` needs, so editing src/ doesn't
#    re-install everything. The postinstall script runs `prisma generate`,
#    which needs the schema + config.
#    prisma.config.ts demands DATABASE_URL, but generate never connects:
#    a fake one, set for this command only (not stored in the image).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
  npm ci --omit=dev && npm cache clean --force

# 2. Our code (tests, .env, node_modules excluded by .dockerignore).
COPY src ./src
COPY start-with-migrations.sh ./

# Don't run as root: if someone breaks into the app, they get a
# powerless user. The official Node image ships one called `node`.
USER node

# Documentation only: the app listens on 3000. Publishing a port is the
# job of `docker run -p` / compose (we don't: Caddy talks to it inside).
EXPOSE 3000

# Docker asks "are you alive?" every 10 s. fetch() is built into Node,
# so no curl needed in the image. PORT: hosts like Render pick their own.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form (a JSON array): node is the main process and gets SIGTERM
# directly. `npm start` would sit in between and not pass it on.
# Default = server only (deploy/compose.yml migrates in its own job).
# Render overrides it with start-with-migrations.sh (see render.yaml).
CMD ["node", "src/index.ts"]

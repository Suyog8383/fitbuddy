#!/bin/sh
# Container start for hosts without a separate migration step (Render free):
# apply pending migrations, THEN start the server.
# `set -e` = stop at the first failure: never start new code against an
# old schema. A failed migration = failed deploy, the old version keeps running.
set -e

# Direct path, not npx: faster on a tiny CPU, no network lookups.
node_modules/.bin/prisma migrate deploy

# exec = node REPLACES this shell, so it receives SIGTERM directly
# (graceful shutdown in index.ts). Without exec, sh would get it instead.
exec node src/index.ts

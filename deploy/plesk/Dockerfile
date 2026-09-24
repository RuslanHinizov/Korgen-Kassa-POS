# Builds the app for a plain Linux (glibc) shared host without Docker, e.g. Plesk "Node.js" hosting.
#   docker build -f deploy/plesk/Dockerfile --output type=local,dest=dist-plesk .
# Result: dist-plesk/korgen-app.tar.gz  (upload + extract in Plesk, see docs/plesk.md)
FROM node:22-bookworm-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV NEXT_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN ./node_modules/.bin/prisma generate && ./node_modules/.bin/next build
# The standalone trace is incomplete under pnpm (e.g. styled-jsx is missing), so ship a flat, production-only
# node_modules instead of the traced one.
RUN mkdir /prod && cp package.json pnpm-lock.yaml pnpm-workspace.yaml /prod/ && cp -r prisma /prod/prisma  && cd /prod && pnpm install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted
RUN mkdir /out && cp -a .next/standalone /out/korgen-app && rm -rf /out/korgen-app/node_modules  && test -f /out/korgen-app/server.js  && cp -a /prod/node_modules /out/korgen-app/node_modules  && mkdir -p /out/korgen-app/.next && cp -a .next/static /out/korgen-app/.next/static  && cp -a public /out/korgen-app/public && rm -rf /out/korgen-app/public/uploads  && cp deploy/plesk/app.js /out/korgen-app/app.js  && node deploy/plesk/relink.js /out/korgen-app && cd /out/korgen-app/node_modules && rm -rf @next/swc-* @swc/core* @esbuild @img playwright playwright-core typescript @ts-morph prisma @prisma/engines @prisma/studio-core .bin && cd /out/korgen-app && rm -rf docs deploy plugins scripts prisma messages/*.md CONTRIBUTING.md PLUGIN_AUTHORING.md README.md LICENSE Dockerfile docker-compose*.yml playwright.config.ts eslint.config.mjs  && cd /out && tar -czf korgen-app.tar.gz korgen-app

FROM scratch AS out
COPY --from=build /out/korgen-app.tar.gz /korgen-app.tar.gz

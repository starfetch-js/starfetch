FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS build

WORKDIR /workspace

COPY package.json package-lock.json lerna.json tsconfig.base.json tsdown.config.ts ./
COPY apps/mcp-app ./apps/mcp-app
COPY packages ./packages

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS runtime

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /workspace

COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/mcp-app/package.json ./apps/mcp-app/package.json
COPY --from=build --chown=node:node /workspace/apps/mcp-app/dist/index.js ./apps/mcp-app/dist/index.js
COPY --from=build --chown=node:node /workspace/apps/mcp-app/web/dist/index.html ./apps/mcp-app/web/dist/index.html
COPY --from=build --chown=node:node /workspace/packages/core/package.json ./packages/core/package.json
COPY --from=build --chown=node:node /workspace/packages/core/dist/index.js ./packages/core/dist/index.js
COPY --from=build --chown=node:node /workspace/packages/mcp/package.json ./packages/mcp/package.json
COPY --from=build --chown=node:node /workspace/packages/mcp/dist/index.js ./packages/mcp/dist/index.js
COPY --from=build --chown=node:node /workspace/packages/skill/package.json ./packages/skill/package.json
COPY --from=build --chown=node:node /workspace/packages/skill/dist/index.js ./packages/skill/dist/index.js
COPY --from=build --chown=node:node /workspace/packages/skill/skill ./packages/skill/skill

USER node

EXPOSE 8080

CMD ["node", "apps/mcp-app/dist/index.js"]

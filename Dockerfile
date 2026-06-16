# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e

FROM ${NODE_IMAGE} AS node-base

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM node-base AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

ARG APP

COPY . .

RUN case "${APP}" in \
        bff|identity|coordinator|signing-node|reveal-vote|socket) ;; \
        *) echo "Unsupported APP=${APP}" >&2; exit 1 ;; \
    esac

RUN case "${APP}" in \
        identity|coordinator|signing-node|reveal-vote) \
            pnpm exec prisma generate --schema "apps/${APP}/prisma/schema.prisma" ;; \
        *) ;; \
    esac

RUN NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run "${APP}:build:production"

# The bundled Prisma client searches the working directory for its native
# engine. Only the Node library runtime and matching engine are required in
# production; Prisma CLI, TypeScript and WASM engines are excluded.
RUN mkdir -p /workspace/runtime/logs \
    && cp -R "dist/apps/${APP}/." /workspace/runtime/ \
    && mkdir -p /workspace/runtime/node_modules \
    && cp -R node_modules/tslib /workspace/runtime/node_modules/tslib \
    && if [ -d "apps/${APP}/generated/prisma" ]; then \
        mkdir -p /workspace/runtime/node_modules/@prisma/client/runtime \
        && cp node_modules/@prisma/client/package.json \
            /workspace/runtime/node_modules/@prisma/client/package.json \
        && cp node_modules/@prisma/client/runtime/library.js \
            /workspace/runtime/node_modules/@prisma/client/runtime/library.js \
        && find "apps/${APP}/generated/prisma" -maxdepth 1 -name 'libquery_engine-*.so.node' \
            -exec cp {} /workspace/runtime/ \; ; \
    fi

FROM base AS runtime-dependencies

WORKDIR /runtime

COPY --from=builder /workspace/runtime/package.json /workspace/runtime/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM ${RUNTIME_IMAGE} AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=runtime-dependencies --chown=65532:65532 /runtime/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /workspace/runtime ./

USER 65532:65532

CMD ["main.js"]

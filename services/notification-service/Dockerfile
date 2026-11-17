# syntax=docker/dockerfile:1

# ---- Stage 1: compile TypeScript and collect the production dependencies -------------------
# The image is published for amd64 (laptops, CI) and arm64 (the production server). The output
# of this stage is plain JavaScript, identical for every CPU, so it runs on the CPU of the
# build machine (BUILDPLATFORM) instead of being emulated; only the small runtime stage is per
# architecture. This trick is valid only while no production dependency is a native module
# (compiled C/C++ code is different for each CPU), and there is none.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app

# Same pnpm version as the "packageManager" field in package.json.
RUN npm install --global pnpm@10.34.5

# Copy only the dependency manifests first: this layer is reused from the Docker cache
# as long as the dependencies do not change, even when the source code does.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Tests, lint and the format check run in CI, not while building the image.
RUN pnpm build

# Remove the devDependencies (TypeScript, Jest, ESLint, the Nest CLI...): what is left in
# node_modules is only what the service needs to run.
RUN pnpm prune --prod

# ---- Stage 2: runtime, only Node + the compiled code + production dependencies -------------
FROM node:26-alpine
WORKDIR /app

# Install the security fixes published after the base image was built (the image scan in CI
# fails on fixable critical vulnerabilities).
RUN apk upgrade --no-cache

# Tells libraries that this is not a development machine.
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Run as the unprivileged "node" user that the base image already has (uid 1000): a bug in the
# app must not give root inside the container. The user is referenced by its numeric id
# because Kubernetes can only verify "runAsNonRoot" against a number, not against a user name.
USER 1000:1000

EXPOSE 3002
# Exec form: node is PID 1 and receives SIGTERM directly, which triggers the graceful shutdown.
ENTRYPOINT ["node", "dist/main.js"]

# syntax=docker/dockerfile:1

# ---- Stage 1: build the static files with Node + pnpm -------------------------------------
FROM node:26-alpine AS build
WORKDIR /app

# Same pnpm version as the "packageManager" field in package.json.
RUN npm install --global pnpm@10.34.5

# Copy only the dependency manifests first: this layer is reused from the Docker cache
# as long as the dependencies do not change, even when the source code does.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- Stage 2: serve them with nginx running as a non-root user ----------------------------
FROM nginxinc/nginx-unprivileged:1.30.6-alpine

# Install the security fixes published after the base image was built (the image scan in CI
# fails on fixable critical vulnerabilities). Needs root for a moment, then goes back to the
# unprivileged nginx user of the base image (uid 101).
USER root
RUN apk upgrade --no-cache
USER 101

# Where nginx forwards /api/ (and the API docs). Override it at run time with -e API_UPSTREAM.
ENV API_UPSTREAM=http://store-api:8080
# Makes the image entrypoint export NGINX_LOCAL_RESOLVERS (the DNS servers of the container),
# which the config template needs for its "resolver" directive.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# On start, the image entrypoint runs envsubst on every file in /etc/nginx/templates and
# writes the result to /etc/nginx/conf.d (replacing the default site).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

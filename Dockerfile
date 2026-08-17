# Build stage — vite needs devDependencies (tsc, plugins), so a full npm ci.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps is required by a PRE-EXISTING conflict in this repo:
# eslint-plugin-jsx-a11y@6.10.2 peer-requires eslint <=9, but devDependencies
# pin eslint 10. It affects lint only — vite and tsc build fine — so the flag
# accepts the same tree a local install produces instead of changing versions.
RUN npm ci --legacy-peer-deps
COPY . .
# Vite inlines env vars at BUILD time, so this is an ARG, not a runtime ENV.
# The default "/api" makes the bundle call its own origin, which nginx below
# proxies to medcode-api — one image, no CORS, no hostname baked in.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Run stage — static files + the /api proxy.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
# 127.0.0.1, not localhost: wget tries ::1 first and nginx's "listen 8080"
# binds IPv4 only, so the localhost form fails with "connection refused" on a
# container that is in fact serving perfectly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

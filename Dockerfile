# Build stage: Node builds the static app and generates nginx's security headers.
FROM node:24-alpine AS build
WORKDIR /app
# There's no .git in the image, so don't install the git hooks.
ENV SKIP_INSTALL_SIMPLE_GIT_HOOKS=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build \
 && node scripts/nginx-security-headers.ts > /app/security-headers.conf

# Serve stage: nginx serves dist/ only. No Node, no API, no stored data (ADR 0001).
FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

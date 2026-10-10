# Build stage: compile React to static files
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage: plain nginx, runs as UID 101 on port 8080
FROM nginxinc/nginx-unprivileged:stable-alpine
USER root
RUN apk update && apk upgrade libexpat
USER 101
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
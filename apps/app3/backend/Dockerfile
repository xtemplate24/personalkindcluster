FROM node:22-alpine
WORKDIR /app
RUN apk update && apk upgrade libssl3 libcrypto3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY package.json server.js ./
USER 101
EXPOSE 8080
CMD ["node", "server.js"]
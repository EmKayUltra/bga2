FROM node:20-alpine

WORKDIR /app

COPY apps/infra/appsync-mock/package*.json ./

RUN npm ci --production

COPY apps/infra/appsync-mock/server.mjs ./

EXPOSE 4006

CMD ["node", "server.mjs"]

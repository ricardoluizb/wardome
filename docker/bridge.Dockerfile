# docker/bridge.Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY bridge/package.json bridge/package-lock.json ./
RUN npm ci --omit=dev

COPY bridge/server.js ./

ENV GAME_HOST=game
ENV GAME_PORT=4000
ENV BRIDGE_PORT=8080

EXPOSE 8080
CMD ["node", "server.js"]

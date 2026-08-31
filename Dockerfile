FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html ./
COPY public ./public
COPY src ./src
COPY vite.config.* ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
WORKDIR /app

RUN useradd --system --uid 10001 --create-home aurora

COPY package.json ./package.json
COPY api ./api
COPY server ./server
COPY --from=build /app/dist ./dist

USER aurora
EXPOSE 8080
CMD ["node", "server/vps.js"]

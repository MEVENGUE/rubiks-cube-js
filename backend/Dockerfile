# Build depuis la racine du repo :
#   docker build -f backend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json ./
COPY backend/server.mjs ./
COPY --from=build /app/frontend/dist ./dist
EXPOSE 4173
CMD ["node", "server.mjs"]

FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM base AS development

ENV NODE_ENV=development

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

FROM base AS build

ARG VITE_API_BASE_URL=http://localhost:3001/api
ARG VITE_BANKING_SERVICE_URL=http://localhost:3005/api/v1
ARG VITE_AUTH_API_BASE_URL=http://localhost:3005/api/v1
ARG VITE_APP_NAME=Enterprise Conversational Platform
ARG VITE_APP_TAGLINE=Configurable AI assistants for secure enterprise workflows
ARG VITE_APP_VERSION=2.0.0
ARG VITE_TENANT_ID=default-enterprise
ARG VITE_SUPPORT_EMAIL=support@example.com
ARG VITE_ALLOW_TOKEN_AUTH=true

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BANKING_SERVICE_URL=$VITE_BANKING_SERVICE_URL
ENV VITE_AUTH_API_BASE_URL=$VITE_AUTH_API_BASE_URL
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_TAGLINE=$VITE_APP_TAGLINE
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_TENANT_ID=$VITE_TENANT_ID
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
ENV VITE_ALLOW_TOKEN_AUTH=$VITE_ALLOW_TOKEN_AUTH

COPY . .

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

RUN npm install -g serve@14.2.6

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]

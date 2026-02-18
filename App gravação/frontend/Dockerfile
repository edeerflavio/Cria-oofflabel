###############################################
# Medical Scribe Frontend — Dockerfile
# Angular 17 multi-stage build + Nginx
###############################################

# Stage 1: Build Angular app
FROM node:20-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NG_CLI_ANALYTICS="false"
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build -- --configuration=production

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist/medical-scribe/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

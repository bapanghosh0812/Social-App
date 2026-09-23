# Production image for the College Campus web app (React + Vite, served by Nginx)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig*.json vite.config.ts index.html postcss.config.js tailwind.config.js ./
RUN npm ci
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

FROM nginx:alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

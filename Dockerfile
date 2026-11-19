# Frontend: se compila con Node y se sirve con nginx sin privilegios (puerto 8080).
# Las imágenes base se pueden cambiar por las del registro corporativo:
#   docker build --build-arg IMAGEN_NODE=... --build-arg IMAGEN_NGINX=... .
ARG IMAGEN_NODE=node:24-alpine
ARG IMAGEN_NGINX=nginxinc/nginx-unprivileged:1.29-alpine

FROM ${IMAGEN_NODE} AS compilacion
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NG_CLI_ANALYTICS=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${IMAGEN_NGINX}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion /app/dist/maestro-web/browser /usr/share/nginx/html
EXPOSE 8080

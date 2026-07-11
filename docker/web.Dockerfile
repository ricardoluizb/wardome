# docker/web.Dockerfile
FROM nginx:alpine

COPY web /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

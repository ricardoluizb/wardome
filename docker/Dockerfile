# docker/Dockerfile
FROM debian:bullseye

RUN apt-get update && apt-get install -y gcc make libc6-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /wardome
COPY wdii /wardome

RUN mkdir -p /wardome/bin && cd /wardome/src && make

WORKDIR /wardome
EXPOSE 4000
CMD ["sh", "-c", "ulimit -c unlimited && exec ./bin/circle -q 4000"]

FROM docker.io/denoland/deno:2.7.4 AS build

WORKDIR /app
RUN --mount=type=bind,src=deno.json,dst=deno.json \
    --mount=type=bind,src=deno.lock,dst=deno.lock \
    deno install
RUN --mount=type=bind,src=src,dst=src \
    --mount=type=bind,src=deno.json,dst=deno.json \
    --mount=type=bind,src=deno.lock,dst=deno.lock \
    deno compile --allow-all --output certkit src/main.ts

FROM docker.io/ubuntu:24.04 AS awscli

ARG TARGETPLATFORM
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl ca-certificates unzip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
RUN --mount=type=bind,src=scripts/install-awscli,dst=/install-awscli \
    /install-awscli

COPY --from=docker.io/goacme/lego /lego /usr/local/bin/lego
COPY --from=build /app/certkit /usr/local/bin/certkit

WORKDIR /root
ENTRYPOINT ["certkit"]

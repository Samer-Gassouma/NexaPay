FROM rust:1.95 AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    clang \
    pkg-config \
    perl \
    git \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.toml
COPY src src

RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/nexapay-node /usr/local/bin/nexapay-node

EXPOSE 8080
CMD ["nexapay-node"]

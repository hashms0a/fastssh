FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

# The libraries Tauri needs to link against glibc 2.35 (plan task 12.9).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
    libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils ca-certificates \
    libfuse2 git python3 && rm -rf /var/lib/apt/lists/*

# Node from the official setup script; NODE_MAJOR is passed from the host's
# major version so the frontend build matches what the repo was developed with.
ARG NODE_MAJOR=22
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - && apt-get install -y nodejs

ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal \
    && chmod -R a+rwX /opt/rustup /opt/cargo

WORKDIR /src

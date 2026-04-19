# pi-fence-live-deps
#
# Container image carrying the binaries pi-fence's live integration tests
# need. Grows as each processor story lands. Today: graphviz only.
#
# Usage from the repo root:
#   pnpm live:build        # docker build -t <pinned-tag> docker/
#   pnpm live:up           # starts it named pi-fence-live-deps
#   pnpm test:live         # runs the live suite against it
#   pnpm live:down         # stops and removes the container
#
# The image is intentionally based on node:22-slim (Debian-slim) so future
# processor stories can add npm-installed binaries like @mermaid-js/mermaid-cli
# without switching base images.

FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       graphviz \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Keep the container alive so `docker exec` can reach it. The live-container
# CLI does not use `docker run` with a one-shot command; it starts a
# long-lived container that tests `docker exec` into.
CMD ["sleep", "infinity"]

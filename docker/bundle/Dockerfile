# pi-fence-bundle
#
# Product sandbox image for command-line renderers that pi-fence can execute
# through the `bundle-sandbox` processor. This image is intentionally separate
# from the test dependency image: that image helps tests reach host-style
# binaries, while this bundle is the runtime sandbox users can opt into.
#
# Expected container contract:
#   docker run -d \
#     --name pi-fence-bundle \
#     --label pi-fence.sandbox=bundle \
#     --network none \
#     --cap-drop ALL \
#     --security-opt no-new-privileges \
#     --tmpfs /tmp \
#     ghcr.io/henriquebastos/pi-fence-bundle:0.1.0

FROM node:22-slim

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       chromium \
       fonts-liberation \
       graphviz \
       libasound2 \
       libatk-bridge2.0-0 \
       libatk1.0-0 \
       libcairo2 \
       libcups2 \
       libdbus-1-3 \
       libdrm2 \
       libexpat1 \
       libgbm1 \
       libglib2.0-0 \
       libgtk-3-0 \
       libnss3 \
       libpango-1.0-0 \
       libx11-6 \
       libxcb1 \
       libxcomposite1 \
       libxdamage1 \
       libxext6 \
       libxfixes3 \
       libxkbcommon0 \
       libxrandr2 \
       xdg-utils \
    && npm install -g @mermaid-js/mermaid-cli \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/pi-fence-bundle

COPY manifest.json /opt/pi-fence-bundle/manifest.json
COPY puppeteer-config.json /opt/pi-fence-bundle/puppeteer-config.json

# Keep the sandbox available for `docker exec`; render commands run on demand.
CMD ["sleep", "infinity"]

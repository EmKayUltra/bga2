FROM node:20-slim

# Install Chrome dependencies + Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
RUN npm init -y && npm install puppeteer-core@24
COPY test-ui.mjs .
ENTRYPOINT ["node", "test-ui.mjs"]

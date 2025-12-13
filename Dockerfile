# [CHANGE] Use node:20-slim (Debian) instead of alpine for better Puppeteer/WebGL support
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm run build:backend

# [CHANGE] Use node:20-slim for production as well
FROM node:20-slim AS production

# [CHANGE] Install dependencies required for Puppeteer on Debian
# We no longer use 'apk', we use 'apt-get'.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# [CHANGE] Update Environment variables for Debian Chromium location
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/dist-backend ./dist-backend
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/server-utils ./server-utils
COPY --from=builder /app/src/config ./src/config

RUN mkdir -p models data

EXPOSE 3001

CMD ["node", "server.js"]
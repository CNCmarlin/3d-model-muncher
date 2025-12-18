# Multi-stage build for optimized production image
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# This ensures thumbnailGenerator.ts and other new files are compiled.
RUN npm run build:backend

# Build the backend utilities
RUN npx tsc --outDir dist-backend --module commonjs --target es2019 src/utils/threeMFToJson.ts src/utils/configManager.ts

# Production stage
FROM node:22-alpine AS production

# Alpine needs these specific packages to run a headless browser.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

#Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Set working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/dist-backend ./dist-backend
COPY --from=builder /app/server.js ./server.js

# Ensure server-utils (runtime adapters/helpers) are included in the production image
COPY --from=builder /app/server-utils ./server-utils

# Copy public folder (Needed for capture.html)
COPY --from=builder /app/public ./public

# Copy configuration files if they exist
COPY --from=builder /app/src/config ./src/config

# Create models directory
RUN mkdir -p models

# Expose port 3001
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
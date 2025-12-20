# Multi-stage build for optimized production image
FROM node:22-slim AS builder

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
FROM node:22-slim AS production

# Alpine needs these specific packages to run a headless browser.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libnss3 \
    libxshmfence1 \
    libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

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
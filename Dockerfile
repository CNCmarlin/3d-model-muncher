# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies like TypeScript)
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# [FIX 1] Build the backend using your script instead of listing files manually
# This ensures thumbnailGenerator.ts, configManager.ts, and everything else is included
RUN npm run build:backend

# Production stage
FROM node:20-alpine AS production

# [FIX 2] Install Chromium for Puppeteer (Required for Alpine Linux)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to skip downloading Chrome and use the one we just installed
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

# Ensure server-utils (runtime adapters/helpers) are included
COPY --from=builder /app/server-utils ./server-utils

# Copy configuration files
# We copy the 'data' folder structure if you want defaults, 
# but usually config is created at runtime.
# This copies your src/config defaults just in case.
COPY --from=builder /app/src/config ./src/config

# Create models and data directory
RUN mkdir -p models data

# Expose port 3001
EXPOSE 3001

# Start the server
CMD ["node", "server.js"]
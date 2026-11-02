# Lead Caffeine — Geofence Advertising Platform
# Docker image for Render (or any container host)

FROM node:20-slim

# Install dependencies for esbuild
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install

# Copy source
COPY . .

# Build client + server
RUN npm run build

# Expose port
ENV PORT=5001
EXPOSE 5001

# Start
CMD ["node", "dist/index.cjs"]

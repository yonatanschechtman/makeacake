FROM node:20-slim

# Install Chromium and Hebrew font support for Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-freefont-ttf \
  fonts-noto \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium (not download its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

# Copy package files and prisma config
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install all dependencies (skip puppeteer browser download)
RUN PUPPETEER_SKIP_DOWNLOAD=true npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]

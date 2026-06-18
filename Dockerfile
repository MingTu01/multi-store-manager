FROM node:20-bookworm-slim

WORKDIR /app

# Install build tools for native modules
RUN apt-get update && \
    apt-get install -y python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY apps/server/package.json ./
RUN npm install && npm cache clean --force

# Remove build tools
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy server source
COPY apps/server/src ./src/
COPY apps/server/tsconfig.json ./

# Copy frontend build to /app/public/web-dist
COPY apps/server/public ./public/

# Also symlink to /public/web-dist for path resolution
RUN mkdir -p /public && ln -s /app/public/web-dist /public/web-dist

# Create persistent directories
RUN mkdir -p data uploads backups

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "--import", "tsx", "src/index.ts"]

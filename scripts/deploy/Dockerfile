FROM node:20-bookworm-slim

WORKDIR /app

# Use Alibaba Cloud apt mirrors for speed
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true

RUN apt-get update && \
    apt-get install -y python3 make g++ --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

COPY .npmrc /app/.npmrc
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com && npm cache clean --force

RUN apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY src ./src/
COPY tsconfig.json ./
COPY public ./public/
COPY msl.js ./msl.js
COPY startup-check.js ./startup-check.js
COPY entrypoint.js ./entrypoint.js
RUN chmod +x /app/entrypoint.js && \
    sed -i '1s/^\xEF\xBB\xBF//' /app/entrypoint.js 2>/dev/null || true

RUN echo '#!/bin/sh' > /usr/local/bin/msl && \
    echo 'node /app/msl.js' >> /usr/local/bin/msl && \
    chmod +x /usr/local/bin/msl && \
    mkdir -p /public data uploads backups && \
    node -e "const p=require('./package.json');require('fs').writeFileSync('data/version.json',JSON.stringify({version:p.version}))"

RUN ln -s /app/public/web-dist /public/web-dist

ENV NODE_ENV=production
ENV PORT=3001
ENV TZ=Asia/Shanghai

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "/app/entrypoint.js"]

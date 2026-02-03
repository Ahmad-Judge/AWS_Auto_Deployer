# All-in-One Dockerfile - Next.js with Deployment Service
# Single container with everything pre-configured
# Perfect for simple deployments to any Docker hosting platform

FROM node:20-alpine

# Install git and glibc compatibility for Next.js SWC
RUN apk add --no-cache git libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy all source code
COPY . .

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Create deployment directories
RUN mkdir -p /app/dist /app/temp

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'node worker.js &' >> /app/start.sh && \
    echo 'npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start both Next.js and worker
CMD ["/app/start.sh"]

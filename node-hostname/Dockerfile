# ---- Builder ---------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app

# Install deps (use ci when lockfile exists; otherwise install)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# ---- Runtime (distroless, non-root) ----------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Copy app as non-root user (UID/GID 65532 = 'nonroot')
COPY --from=deps --chown=65532:65532 /app /app

# Document the listen port
EXPOSE 3000

# Distroless entrypoint is `node`; run the Express bootstrap
CMD ["./bin/www"]


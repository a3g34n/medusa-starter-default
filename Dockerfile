# Production Dockerfile for Medusa

# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Stage 2: Run the application
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.medusa ./.medusa
COPY --from=builder /app/medusa-config.ts ./medusa-config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Copy public folder if it exists (for static assets)
# COPY --from=builder /app/public ./public 

# Install only production dependencies (optional if we copy node_modules from builder, 
# but builder has devDeps. Better to prune or just copy. 
# Since yarn berry is used, node_modules might not exist in the same way, 
# but likely using node-modules linker based on previous file viewing)

# Copy the startup script
COPY start_prod.sh ./start_prod.sh
RUN chmod +x ./start_prod.sh

# Expose port
EXPOSE 9000

# Start command
CMD ["./start_prod.sh"]
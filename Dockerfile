# Stage 1: Build the frontend
FROM node:20-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Build the backend and serve everything
FROM node:20-slim
WORKDIR /app

# Copy root package.json for dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend files
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=client-builder /app/client/dist ./client/dist

# The backend will serve static files from client/dist in a real production setup
# For this prototype, we'll use a simple environment variable to point to the static folder
ENV STATIC_PATH=/app/client/dist
ENV PORT=5001

EXPOSE 5001

CMD ["node", "server/index.js"]

# Deploying Medusa to Hetzner CAX11 (Production)

This guide walks you through deploying your Medusa backend to a Hetzner Cloud server (CAX11 - ARM64).

## Prerequisites

- A Hetzner Cloud Server (CAX11 recommended for cost/performance).
- SSH access to your server.
- Git installed on the server.
- Docker and Docker Compose installed on the server.

## 1. Server Setup (If not already done)

SSH into your server and install Docker:

```bash
ssh root@<your-server-ip>

# Update system
apt update && apt upgrade -y

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verify installation
docker --version
docker compose version
```

## 2. Prepare the Project

1.  **Clone your repository** on the server:

    ```bash
    git clone <your-repo-url> medusa-store
    cd medusa-store
    ```

2.  **Configure Environment Variables**:
    Copy the production template to a real `.env` file:

    ```bash
    cp .env.production.template .env.production
    ```

    **CRITICAL**: Edit `.env.production` and set strong passwords and secrets!

    ```bash
    nano .env.production
    ```

    - Set `POSTGRES_PASSWORD` to a strong random string.
    - Set `JWT_SECRET` and `COOKIE_SECRET` to long random strings.
    - Update `STORE_CORS` AND `ADMIN_CORS` with your actual domain names.

3.  **Configure Caddy (SSL & Domain)**:
    Edit the `Caddyfile` to use your real email address for Let's Encrypt notifications:
    ```bash
    nano Caddyfile
    ```
    Change `your-email@example.com` to your actual email.

## 3. DNS Configuration (Crucial!)

Before starting the containers, you must point your domain to the server so Caddy can get an SSL certificate.

1.  Log in to your Domain Registrar or DNS Provider.
2.  Create an **A Record**:
    - **Name/Host**: `admin`
    - **Value/Target**: `<Your Hetzner Server IP>`
    - **TTL**: Default / Automatic

Wait a few minutes for DNS to propagate.

## 4. Deploy

Build and start the containers in detached mode:

```bash
docker compose -f docker-compose.production.yml up -d --build
```

- `--build`: Forces a rebuild of the image (useful after git pull).
- `-d`: Detached mode (runs in background).

## 5. Verify Deployment

Check the status of your containers:

```bash
docker compose -f docker-compose.production.yml ps
```

View logs to ensure Medusa and Caddy started correctly:

```bash
docker compose -f docker-compose.production.yml logs -f caddy
```

Run a health check (from the server):

```bash
curl http://localhost:9000/health
```

## 6. Accessing the Admin

Open your browser and navigate to:
**https://admin.lounjstudio.com/app**

You should see a secure (lock icon) connection.

## 7. Updates

To deploy changes (after pushing to git):

```bash
# Pull latest code
git pull origin main

# Rebuild and restart containers
docker compose -f docker-compose.production.yml up -d --build
```

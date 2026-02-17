#!/bin/sh

# Stop on error
set -e

echo "Starting Medusa in production..."

# Run migrations
echo "Running database migrations..."
# In Medusa v2, we use 'npx medusa db:migrate' or just 'medusa db:migrate' if installed globally/in path
# Using yarn to ensure we use the project's medusa binary
yarn medusa db:migrate

# Note: We do NOT seed in production by default to avoid data loss.
# If you need to seed for the very first time, you can run this manually:
# yarn seed

echo "Starting Medusa server..."
yarn start

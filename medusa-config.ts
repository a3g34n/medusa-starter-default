import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  modules: [
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              file_url: process.env.S3_FILE_URL || "https://media.lounjstudio.com",
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              region: process.env.S3_REGION,
              bucket: process.env.S3_BUCKET,
              endpoint: process.env.S3_ENDPOINT,
            },
          },
        ],
      },
    },
  ],
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    databaseDriverOptions: {
      ssl: false,
      sslmode: "disable",
    },

  },
   admin: {
    vite: (config) => {
      return {
        plugins: [
          {
            name: "increase-upload-size-limit",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              if (code.includes("DEFAULT_MAX_FILE_SIZE = 1024 * 1024")) {
                return code.replace("DEFAULT_MAX_FILE_SIZE = 1024 * 1024", "DEFAULT_MAX_FILE_SIZE = Infinity")
              }
            },
          },
        ],
        server: {
          host: "0.0.0.0",
          // Allow all hosts when running in Docker (development mode)
          // In production, this should be more restrictive
          allowedHosts: [
            "localhost",
            ".localhost",
            "127.0.0.1",
          ],
          hmr: {
            // HMR websocket port inside container
            port: 5173,
            // Port browser connects to (exposed in docker-compose.yml)
            clientPort: 5173,
          },
        },
      }
    },
  },
})

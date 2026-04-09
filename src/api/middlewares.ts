import { defineMiddlewares } from "@medusajs/framework/http"
import express from "express"

export default defineMiddlewares({
  routes: [
    {
      // PayTR posts webhook as application/x-www-form-urlencoded.
      // Disable Medusa's default JSON body parser for this route and use urlencoded instead.
      matcher: "/store/paytr/webhook",
      bodyParser: false,
      middlewares: [express.urlencoded({ extended: false })],
    },
  ],
})

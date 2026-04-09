import { defineMiddlewares } from "@medusajs/framework/http"
import express from "express"

export default defineMiddlewares({
  routes: [
    {
      // PayTR posts webhook as application/x-www-form-urlencoded
      matcher: "/store/paytr/webhook",
      middlewares: [express.urlencoded({ extended: false })],
    },
  ],
})

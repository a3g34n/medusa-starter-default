import { defineMiddlewares, MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Bypass the publishable API key check for PayTR webhook.
// PayTR sends application/x-www-form-urlencoded with no x-publishable-api-key header.
function skipPublishableKeyCheck(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  req.get = new Proxy(req.get.bind(req), {
    apply(target, _thisArg, [header]: [string]) {
      if (header?.toLowerCase() === "x-publishable-api-key") {
        return "bypass"
      }
      return target(header)
    },
  }) as typeof req.get
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/paytr/webhook",
      middlewares: [skipPublishableKeyCheck],
    },
  ],
})

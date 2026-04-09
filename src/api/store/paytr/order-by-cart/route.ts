import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Look up the Medusa order created from a cart after PayTR payment.
 *
 * GET /store/paytr/order-by-cart?cart_id=cart_01...
 * Response: { order_id: "order_01..." }
 *
 * Uses a raw knex query because IOrderModuleService.listOrders
 * does not support filtering by cart_id via MikroORM.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cart_id = req.query.cart_id as string | undefined

  if (!cart_id) {
    return res.status(400).json({ error: "cart_id is required" })
  }

  const pgConnection = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

  const rows = await pgConnection("order").where({ cart_id }).select("id").limit(1)

  const order = rows?.[0]
  if (!order) {
    return res.status(404).json({ error: "Order not found for this cart" })
  }

  return res.json({ order_id: order.id })
}

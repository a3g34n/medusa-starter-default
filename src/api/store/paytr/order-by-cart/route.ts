import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Look up the Medusa order created from a cart after PayTR payment.
 *
 * GET /store/paytr/order-by-cart?cart_id=cart_01...
 * Response: { order_id: "order_01..." }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cart_id = req.query.cart_id as string | undefined

  if (!cart_id) {
    return res.status(400).json({ error: "cart_id is required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // In Medusa v2, the cart→order link is queryable through the cart entity
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "completed_at", "order.id"],
    filters: { id: cart_id },
  })

  const order_id = (carts?.[0] as any)?.order?.id

  if (!order_id) {
    return res.status(404).json({ error: "Order not found for this cart" })
  }

  return res.json({ order_id })
}

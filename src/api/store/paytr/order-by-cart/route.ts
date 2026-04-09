import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Look up the Medusa order created from a cart after PayTR payment.
 *
 * GET /store/paytr/order-by-cart?cart_id=cart_01...
 * Response: { order_id: "order_01..." }
 *
 * Use this on the PayTR success page: PAYTR_OK_URL should include
 * ?cart_id=<cart_id> so the page can call this endpoint to get the order_id
 * and redirect to /order/confirmed/<order_id>.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const cart_id = req.query.cart_id as string | undefined

  if (!cart_id) {
    return res.status(400).json({ error: "cart_id is required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { cart_id },
  })

  const order = orders?.[0]
  if (!order) {
    return res.status(404).json({ error: "Order not found for this cart" })
  }

  return res.json({ order_id: order.id })
}

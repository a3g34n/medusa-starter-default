import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IOrderModuleService } from "@medusajs/types"

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

  const orderService = req.scope.resolve<IOrderModuleService>(Modules.ORDER)

  const orders = await orderService.listOrders(
    { cart_id } as any,
    { select: ["id"], take: 1 }
  )

  const order = orders?.[0]
  if (!order) {
    return res.status(404).json({ error: "Order not found for this cart" })
  }

  return res.json({ order_id: order.id })
}

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { INotificationModuleService } from "@medusajs/types"

export default async function orderPlacedHandler({ event, container }: SubscriberArgs<{ id: string }>) {
  const orderId = event.data.id

  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "items.title",
      "items.quantity",
      "items.unit_price",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0]
  if (!order) return

  const notificationService = container.resolve<INotificationModuleService>(Modules.NOTIFICATION)

  // Email to customer
  await notificationService.createNotifications({
    to: order.email,
    channel: "email",
    template: "order.placed",
    data: { order },
  })

  // Email to store owner
  const adminEmail = process.env.STORE_ADMIN_EMAIL
  if (adminEmail) {
    await notificationService.createNotifications({
      to: adminEmail,
      channel: "email",
      template: "order.placed.admin",
      data: { order },
    })
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}

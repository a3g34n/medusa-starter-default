import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import { Resend } from "resend"

type ResendOptions = {
  api_key: string
  from: string
}

type InjectedDependencies = {
  logger: Logger
}

type NotificationData = {
  to: string
  template: string
  data: Record<string, unknown>
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"

  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  async send(notification: NotificationData): Promise<{ id: string }> {
    const { to, template, data } = notification

    const { subject, html } = this.buildEmail(template, data)

    const { data: result, error } = await this.resendClient.emails.send({
      from: this.options.from,
      to,
      subject,
      html,
    })

    if (error) {
      this.logger.error(`[Resend] Failed to send email: ${error.message}`)
      throw new Error(error.message)
    }

    this.logger.info(`[Resend] Email sent to ${to} (template: ${template}, id: ${result?.id})`)
    return { id: result?.id ?? "" }
  }

  private buildEmail(template: string, data: Record<string, unknown>): { subject: string; html: string } {
    switch (template) {
      case "order.placed":
        return this.orderPlacedTemplate(data)
      case "order.placed.admin":
        return this.orderPlacedAdminTemplate(data)
      default:
        this.logger.warn(`[Resend] Unknown template: ${template}`)
        return { subject: "Lounj Studio Bildirimi", html: "<p>Bildirim</p>" }
    }
  }

  private orderPlacedTemplate(data: Record<string, unknown>): { subject: string; html: string } {
    const order = data.order as any

    const displayId = order?.display_id ?? order?.id ?? "-"
    const email = order?.email ?? "-"
    const total = order?.total != null
      ? `${Number(order.total).toLocaleString("tr-TR")} ${(order.currency_code ?? "TRY").toUpperCase()}`
      : "-"

    const itemRows = (order?.items ?? [])
      .map((item: any) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee">${item.title ?? "-"}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">
            ${Number(item.unit_price ?? 0).toLocaleString("tr-TR")} ${(order.currency_code ?? "TRY").toUpperCase()}
          </td>
        </tr>`)
      .join("")

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Sipariş Onayı</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;margin-bottom:30px">
    <h1 style="color:#1a1a1a;font-size:24px;margin:0">LOUNJ STUDIO</h1>
  </div>
  <h2 style="font-size:20px">Siparişiniz Alındı!</h2>
  <p>Merhaba,</p>
  <p>Siparişiniz başarıyla alındı. Aşağıda sipariş detaylarınızı bulabilirsiniz.</p>

  <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0">
    <p style="margin:4px 0"><strong>Sipariş No:</strong> #${displayId}</p>
    <p style="margin:4px 0"><strong>E-posta:</strong> ${email}</p>
    <p style="margin:4px 0"><strong>Toplam:</strong> ${total}</p>
  </div>

  ${itemRows ? `
  <table style="width:100%;border-collapse:collapse;margin-top:20px">
    <thead>
      <tr style="background:#f0f0f0">
        <th style="padding:8px;text-align:left">Ürün</th>
        <th style="padding:8px;text-align:center">Adet</th>
        <th style="padding:8px;text-align:right">Fiyat</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>` : ""}

  <p style="margin-top:30px">Siparişinizle ilgili sorularınız için <a href="mailto:info@lounjstudio.com">info@lounjstudio.com</a> adresinden bize ulaşabilirsiniz.</p>
  <p>Teşekkür ederiz,<br><strong>Lounj Studio</strong></p>
</body>
</html>`

    return {
      subject: `Siparişiniz Alındı — #${displayId}`,
      html,
    }
  }

  private orderPlacedAdminTemplate(data: Record<string, unknown>): { subject: string; html: string } {
    const order = data.order as any
    const displayId = order?.display_id ?? order?.id ?? "-"
    const email = order?.email ?? "-"
    const total = order?.total != null
      ? `${Number(order.total).toLocaleString("tr-TR")} ${(order.currency_code ?? "TRY").toUpperCase()}`
      : "-"

    const itemRows = (order?.items ?? [])
      .map((item: any) => `<li>${item.quantity}x ${item.title} — ${Number(item.unit_price ?? 0).toLocaleString("tr-TR")} ${(order.currency_code ?? "TRY").toUpperCase()}</li>`)
      .join("")

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2>Yeni Sipariş: #${displayId}</h2>
  <p><strong>Müşteri:</strong> ${email}</p>
  <p><strong>Toplam:</strong> ${total}</p>
  ${itemRows ? `<ul>${itemRows}</ul>` : ""}
  <p><a href="https://admin.lounjstudio.com/orders/${order?.id}">Admin panelinde görüntüle →</a></p>
</body>
</html>`

    return {
      subject: `Yeni Sipariş #${displayId} — ${total}`,
      html,
    }
  }
}

export default ResendNotificationProviderService

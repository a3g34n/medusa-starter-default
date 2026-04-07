import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"
import type { IPaymentModuleService, IEventBusModuleService } from "@medusajs/types"
import crypto from "crypto"

/**
 * PayTR payment notification callback.
 *
 * Configure this URL in your PayTR merchant panel as "Bildirim URL":
 *   https://your-backend-domain/store/paytr/webhook
 *
 * PayTR POSTs URL-encoded data and expects "OK" in the response body.
 * If it doesn't receive "OK", it retries up to 10 times over 24 hours.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as Record<string, string>

  const { merchant_oid, status, total_amount, hash } = body

  // ── 1. Validate required fields ────────────────────────────────────────────
  if (!merchant_oid || !status || !total_amount || !hash) {
    // Respond OK to stop PayTR retrying a malformed request
    return res.send("OK")
  }

  // ── 2. Validate PayTR HMAC signature ───────────────────────────────────────
  // Formula: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key))
  const merchantKey = process.env.PAYTR_MERCHANT_KEY
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT

  if (!merchantKey || !merchantSalt) {
    // Misconfigured server — don't let PayTR retry endlessly
    return res.send("OK")
  }

  const expectedHash = crypto
    .createHmac("sha256", merchantKey)
    .update(merchant_oid + merchantSalt + status + total_amount)
    .digest("base64")

  if (hash !== expectedHash) {
    // Invalid signature — could be a spoofed request
    return res.send("OK")
  }

  // ── 3. Update session data so authorizePayment knows the payment was confirmed ──
  try {
    const paymentModuleService = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT)

    // Retrieve existing session data to merge (merchant_oid === session_id)
    const session = await paymentModuleService.retrievePaymentSession(merchant_oid, {
      select: ["id", "data"],
    })

    const updatedData = {
      ...(session.data ?? {}),
      paytr_confirmed: status === "success",
      paytr_status: status,
      paytr_total_amount: total_amount,
    }

    await paymentModuleService.updatePaymentSession({
      id: merchant_oid,
      data: updatedData,
    })

    // ── 4. Emit webhook event so processPaymentWorkflow runs ─────────────────
    const eventBus = req.scope.resolve<IEventBusModuleService>(Modules.EVENT_BUS)

    await eventBus.emit(
      {
        name: PaymentWebhookEvents.WebhookReceived,
        data: {
          provider: "paytr",
          payload: {
            data: body,
            rawData: JSON.stringify(body),
            headers: req.headers as Record<string, unknown>,
          },
        },
      },
      {
        // Small delay — data is already updated so no race condition risk
        delay: 500,
        attempts: 3,
      }
    )
  } catch {
    // Even if processing fails, respond OK to avoid PayTR retrying.
    // The event will be retried by the event bus.
  }

  // ── 5. PayTR requires exactly "OK" as the response body ───────────────────
  res.send("OK")
}

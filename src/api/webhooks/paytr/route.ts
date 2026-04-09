import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, PaymentWebhookEvents } from "@medusajs/framework/utils"
import type { IPaymentModuleService, IEventBusModuleService } from "@medusajs/types"
import crypto from "crypto"
import { IncomingMessage } from "http"

/**
 * Read the raw request body as a string, then parse as urlencoded.
 * PayTR sends application/x-www-form-urlencoded.
 */
function readUrlencodedBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => (data += chunk.toString()))
    req.on("end", () => {
      try {
        const params = new URLSearchParams(data)
        const result: Record<string, string> = {}
        params.forEach((value, key) => { result[key] = value })
        resolve(result)
      } catch (e) {
        reject(e)
      }
    })
    req.on("error", reject)
  })
}

/**
 * PayTR payment notification callback.
 *
 * Set this URL in your PayTR merchant panel as "Bildirim URL":
 *   https://admin.lounjstudio.com/webhooks/paytr
 *
 * This route is outside /store/ to avoid the publishable API key requirement.
 * PayTR POSTs URL-encoded data and expects "OK" in the response body.
 * If it doesn't receive "OK", it retries up to 10 times over 24 hours.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  let body: Record<string, string>
  try {
    body = await readUrlencodedBody(req)
  } catch {
    return res.send("OK")
  }

  const { merchant_oid, status, total_amount, hash } = body

  // ── 1. Validate required fields ────────────────────────────────────────────
  if (!merchant_oid || !status || !total_amount || !hash) {
    return res.send("OK")
  }

  // ── 2. Validate PayTR HMAC signature ───────────────────────────────────────
  const merchantKey = process.env.PAYTR_MERCHANT_KEY
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT

  if (!merchantKey || !merchantSalt) {
    return res.send("OK")
  }

  const expectedHash = crypto
    .createHmac("sha256", merchantKey)
    .update(merchant_oid + merchantSalt + status + total_amount)
    .digest("base64")

  if (hash !== expectedHash) {
    return res.send("OK")
  }

  // Reconstruct Medusa session ID: we stripped "_" before sending to PayTR
  // e.g. "payses01ABC" → "payses_01ABC"
  const session_id = merchant_oid.replace(/^payses/, "payses_")

  // ── 3. Update session data so authorizePayment knows the payment was confirmed ──
  try {
    const paymentModuleService = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT)

    const session = await paymentModuleService.retrievePaymentSession(session_id, {
      select: ["id", "data", "amount", "currency_code"],
    })

    const updatedData = {
      ...(session.data ?? {}),
      paytr_confirmed: status === "success",
      paytr_status: status,
      paytr_total_amount: total_amount,
    }

    await paymentModuleService.updatePaymentSession({
      id: session_id,
      currency_code: session.currency_code,
      amount: session.amount,
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
        delay: 500,
        attempts: 3,
      }
    )
  } catch {
    // Even if processing fails, respond OK to avoid PayTR retrying.
  }

  // ── 5. PayTR requires exactly "OK" as the response body ───────────────────
  res.send("OK")
}

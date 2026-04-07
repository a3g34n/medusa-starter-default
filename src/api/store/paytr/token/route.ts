import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type { IPaymentModuleService } from "@medusajs/types"
import { getPayTRIframeToken } from "../../../../modules/payment-paytr/utils"

type TokenRequestBody = {
  session_id: string
  /** Optional basket items: [[name, unit_price_str, qty_str], ...] */
  basket_items?: [string, string, string][]
}

/**
 * Get a PayTR iframe token for an existing payment session.
 *
 * The storefront calls this after creating the payment session to display
 * the PayTR payment iframe.
 *
 * POST /store/paytr/token
 * Body: { session_id: "payses_...", basket_items?: [...] }
 *
 * Response: { iframe_token: "..." }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { session_id, basket_items } = req.body as TokenRequestBody

  if (!session_id) {
    return res.status(400).json({ error: "session_id is required" })
  }

  // ── 1. Retrieve the payment session ─────────────────────────────────────
  const paymentModuleService = req.scope.resolve<IPaymentModuleService>(Modules.PAYMENT)

  let session: Awaited<ReturnType<typeof paymentModuleService.retrievePaymentSession>>
  try {
    session = await paymentModuleService.retrievePaymentSession(session_id, {
      select: ["id", "data", "amount", "currency_code"],
    })
  } catch {
    return res.status(404).json({ error: "Payment session not found" })
  }

  const sessionData = (session.data ?? {}) as Record<string, unknown>

  // merchant_oid was set in initiatePayment as the session_id (idempotency_key)
  const merchant_oid = (sessionData.merchant_oid as string) ?? session_id

  // ── 2. Get user IP ───────────────────────────────────────────────────────
  const userIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "1.2.3.4"

  // ── 3. Get customer email ────────────────────────────────────────────────
  // Try from session context, fall back to a placeholder
  const email = (sessionData.customer_email as string) ?? "customer@example.com"

  // ── 4. Build basket ──────────────────────────────────────────────────────
  // PayTR expects: [[name, unit_price_str, qty_str], ...]
  // unit_price_str is in main currency unit (e.g. "100.00" for 100 TRY)
  let basket: [string, string, string][]

  if (basket_items && basket_items.length > 0) {
    basket = basket_items
  } else {
    // Generate a single-item basket from the total amount
    const amountInMainUnit = (Number(session.amount) / 100).toFixed(2)
    basket = [["Order", amountInMainUnit, "1"]]
  }

  const user_basket = Buffer.from(JSON.stringify(basket)).toString("base64")

  // ── 5. Call PayTR API ────────────────────────────────────────────────────
  const result = await getPayTRIframeToken(
    {
      merchant_id: process.env.PAYTR_MERCHANT_ID!,
      merchant_key: process.env.PAYTR_MERCHANT_KEY!,
      merchant_salt: process.env.PAYTR_MERCHANT_SALT!,
      merchant_ok_url: process.env.PAYTR_OK_URL!,
      merchant_fail_url: process.env.PAYTR_FAIL_URL!,
      test_mode: process.env.NODE_ENV !== "production",
      max_installment: parseInt(process.env.PAYTR_MAX_INSTALLMENT ?? "12", 10),
    },
    {
      user_ip: userIp,
      merchant_oid,
      email,
      payment_amount: Number(session.amount), // already in kuruş
      user_basket,
      currency: (session.currency_code ?? "TRY").toUpperCase(),
    }
  )

  if (result.status === "failed") {
    return res.status(502).json({ error: result.reason })
  }

  return res.json({ iframe_token: result.token })
}


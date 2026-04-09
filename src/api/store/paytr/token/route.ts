import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getPayTRIframeToken } from "../../../../modules/payment-paytr/utils"

type TokenRequestBody = {
  cart_id: string
}

/**
 * Get a PayTR iframe token for a cart's active payment session.
 *
 * POST /store/paytr/token
 * Body: { cart_id: "cart_..." }
 * Response: { iframe_token: "..." }
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { cart_id } = req.body as TokenRequestBody

  if (!cart_id) {
    return res.status(400).json({ error: "cart_id is required" })
  }

  // ── 1. Look up cart → payment session via query graph ──────────────────
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "currency_code",
      "items.title",
      "items.unit_price",
      "items.quantity",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.address_1",
      "shipping_address.city",
      "shipping_address.phone",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.amount",
      "payment_collection.payment_sessions.data",
    ],
    filters: { id: cart_id },
  })

  const cart = carts?.[0]
  if (!cart) {
    return res.status(404).json({ error: "Cart not found" })
  }

  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.provider_id === "pp_paytr_paytr"
  )

  if (!paymentSession) {
    return res.status(404).json({ error: "PayTR payment session not found for this cart" })
  }

  const sessionData = (paymentSession.data ?? {}) as Record<string, unknown>
  const merchant_oid = (sessionData.merchant_oid as string) ?? paymentSession.id

  // ── 2. Get user IP ──────────────────────────────────────────────────────
  const userIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "1.2.3.4"

  // ── 3. Build basket from cart line items ────────────────────────────────
  // PayTR expects: [[name, unit_price_str, qty], ...]
  // unit_price_str is in main currency unit (e.g. "990.00" for 990 TRY)
  let basket: [string, string, number][]

  if (cart.items?.length > 0) {
    basket = cart.items.map((item: any) => [
      item.title ?? "Product",
      (Number(item.unit_price) / 100).toFixed(2),
      item.quantity,
    ])
  } else {
    const amountInMainUnit = (Number(paymentSession.amount) / 100).toFixed(2)
    basket = [["Order", amountInMainUnit, 1]]
  }

  const user_basket = Buffer.from(JSON.stringify(basket)).toString("base64")

  // ── 4. Build user info from shipping address ────────────────────────────
  const addr = cart.shipping_address
  const user_name = [addr?.first_name, addr?.last_name].filter(Boolean).join(" ") || "Müşteri"
  const user_address = [addr?.address_1, addr?.city].filter(Boolean).join(", ") || "-"
  const user_phone = addr?.phone || "05000000000"

  // ── 5. Call PayTR API ───────────────────────────────────────────────────
  console.log("[PayTR] Requesting token for merchant_oid:", merchant_oid, "amount:", paymentSession.amount, "currency:", cart.currency_code)
  const result = await getPayTRIframeToken(
    {
      merchant_id: process.env.PAYTR_MERCHANT_ID!,
      merchant_key: process.env.PAYTR_MERCHANT_KEY!,
      merchant_salt: process.env.PAYTR_MERCHANT_SALT!,
      merchant_ok_url: process.env.PAYTR_OK_URL!,
      merchant_fail_url: process.env.PAYTR_FAIL_URL!,
      test_mode: process.env.PAYTR_TEST_MODE === "1",
      max_installment: parseInt(process.env.PAYTR_MAX_INSTALLMENT ?? "12", 10),
    },
    {
      user_ip: userIp,
      merchant_oid,
      email: cart.email ?? "customer@example.com",
      payment_amount: Number(paymentSession.amount),
      user_basket,
      currency: (cart.currency_code ?? "TRY").toUpperCase(),
      user_name,
      user_address,
      user_phone,
    }
  )

  if (result.status === "failed") {
    console.error("[PayTR] Token request failed:", result.reason)
    return res.status(502).json({ error: result.reason })
  }

  return res.json({ iframe_token: result.token })
}

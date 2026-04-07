import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"
import type {
  InitiatePaymentInput,
  InitiatePaymentOutput,
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  RefundPaymentInput,
  RefundPaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/types"
import crypto from "crypto"
import https from "https"

export type PayTROptions = {
  merchant_id: string
  merchant_key: string
  merchant_salt: string
  merchant_ok_url: string
  merchant_fail_url: string
  test_mode?: boolean
  max_installment?: number // 0 = all available, or a specific number like 12
  debug?: boolean
}

class PayTRProviderService extends AbstractPaymentProvider<PayTROptions> {
  static identifier = "paytr"

  static validateOptions(options: Record<string, unknown>) {
    const required = ["merchant_id", "merchant_key", "merchant_salt", "merchant_ok_url", "merchant_fail_url"]
    for (const key of required) {
      if (!options[key]) {
        throw new Error(`PayTR provider: "${key}" is required in options.`)
      }
    }
  }

  /**
   * Compute HMAC-SHA256 base64 of message using merchant_key as the key.
   * PayTR embeds merchant_salt inside the message string at different positions
   * for token vs webhook — the caller is responsible for building the full message.
   */
  private hmac(message: string): string {
    return crypto
      .createHmac("sha256", this.config.merchant_key)
      .update(message)
      .digest("base64")
  }

  /**
   * Map Medusa ISO 4217 currency code to PayTR currency value.
   * PayTR uses "TL" for Turkish Lira, not the ISO code "TRY".
   */
  private toPayTRCurrency(currency_code: string): string {
    const map: Record<string, string> = { TRY: "TL" }
    return map[currency_code.toUpperCase()] ?? currency_code.toUpperCase()
  }

  async getIframeToken(params: {
    user_ip: string
    merchant_oid: string
    email: string
    payment_amount: number // in kuruş (smallest currency unit)
    user_basket: string    // base64-encoded JSON: [[name, unit_price_str, qty_str], ...]
    currency: string       // Medusa currency code, e.g. "TRY"
    user_name?: string
    user_address?: string
    user_phone?: string
    no_installment?: number  // 0 = allow installments (default), 1 = no installments
    max_installment?: number // 0 = all (default), or specific max count
  }): Promise<{ status: "success"; token: string } | { status: "failed"; reason: string }> {
    const {
      user_ip,
      merchant_oid,
      email,
      payment_amount,
      user_basket,
      user_name = "",
      user_address = "",
      user_phone = "",
      no_installment = 0,
      max_installment = this.config.max_installment ?? 0,
    } = params

    // PayTR uses "TL" for Turkish Lira, not the ISO code "TRY"
    const currency = this.toPayTRCurrency(params.currency)
    const test_mode = this.config.test_mode ? "1" : "0"
    const debug_on = this.config.debug ? "1" : "0"

    // Build hash string: all params concatenated + merchant_salt, keyed by merchant_key
    // Matches official sample: hashSTR + merchant_salt → hmac with merchant_key
    const hashStr = [
      this.config.merchant_id,
      user_ip,
      merchant_oid,
      email,
      payment_amount.toString(),
      user_basket,
      no_installment.toString(),
      max_installment.toString(),
      currency,
      test_mode,
    ].join("")

    const paytr_token = this.hmac(hashStr + this.config.merchant_salt)

    const postData = new URLSearchParams({
      merchant_id: this.config.merchant_id,
      merchant_key: this.config.merchant_key,
      merchant_salt: this.config.merchant_salt,
      user_ip,
      merchant_oid,
      email,
      payment_amount: payment_amount.toString(),
      paytr_token,
      user_basket,
      user_name,
      user_address,
      user_phone,
      debug_on,
      no_installment: no_installment.toString(),
      max_installment: max_installment.toString(),
      currency,
      test_mode,
      merchant_ok_url: this.config.merchant_ok_url,
      merchant_fail_url: this.config.merchant_fail_url,
      timeout_limit: "30",
      lang: "tr",
    }).toString()

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "www.paytr.com",
          path: "/odeme/api/get-token",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          let data = ""
          res.on("data", (chunk) => (data += chunk))
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data)
              if (parsed.status === "success") {
                resolve({ status: "success", token: parsed.token })
              } else {
                resolve({ status: "failed", reason: parsed.reason ?? "Unknown PayTR error" })
              }
            } catch {
              reject(new Error(`PayTR response parse error: ${data}`))
            }
          })
        }
      )
      req.on("error", reject)
      req.write(postData)
      req.end()
    })
  }

  /**
   * Validate PayTR webhook hash.
   * Formula: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key))
   */
  validateWebhookHash(params: {
    merchant_oid: string
    status: string
    total_amount: string
    hash: string
  }): boolean {
    const expected = this.hmac(
      params.merchant_oid + this.config.merchant_salt + params.status + params.total_amount
    )
    return params.hash === expected
  }

  // ─── AbstractPaymentProvider implementation ───────────────────────────────

  /**
   * Called when a payment session is created. We store the merchant_oid
   * (= the session ID, provided via context.idempotency_key) for later use.
   * The iframe token is fetched separately by the storefront via POST /store/paytr/token.
   */
  async initiatePayment(data: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { amount, currency_code, context } = data

    // context.idempotency_key is the payment session ID — use it as merchant_oid
    // so the webhook can return session_id = merchant_oid without a DB lookup.
    const merchant_oid = (context?.idempotency_key as string) ?? `paytr_${Date.now()}`

    return {
      id: merchant_oid,
      data: {
        merchant_oid,
        status: "pending",
        amount: Number(amount),
        currency: currency_code.toUpperCase(),
        paytr_confirmed: false,
      },
    }
  }

  /**
   * Called during cart completion (authorizePaymentSession).
   * PayTR payments are confirmed asynchronously via webhook.
   * The webhook handler updates session data with paytr_confirmed=true.
   */
  async authorizePayment(data: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const sessionData = (data.data ?? {}) as Record<string, unknown>

    if (sessionData.paytr_confirmed === true) {
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: sessionData,
      }
    }

    return {
      status: PaymentSessionStatus.PENDING,
      data: sessionData,
    }
  }

  /**
   * PayTR captures payment automatically — no separate capture step needed.
   */
  async capturePayment(data: CapturePaymentInput): Promise<CapturePaymentOutput> {
    return {
      data: { ...(data.data ?? {}), status: "captured" },
    }
  }

  /**
   * Refund via PayTR Refund API.
   * https://www.paytr.com/odeme/iade
   * Token formula: base64(hmac_sha256(merchant_id + merchant_oid + return_amount + merchant_salt, merchant_key))
   * return_amount is in main currency unit (e.g. "11.97"), NOT in kuruş.
   */
  async refundPayment(data: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const sessionData = (data.data ?? {}) as Record<string, unknown>
    const merchant_oid = sessionData.merchant_oid as string

    if (!merchant_oid) {
      return { data: sessionData }
    }

    // refund_amount comes from Medusa in subunits (kuruş) — convert to main unit
    const refundAmountKurus = Number(data.amount ?? 0)
    const return_amount = (refundAmountKurus / 100).toFixed(2)

    const paytr_token = this.hmac(
      this.config.merchant_id + merchant_oid + return_amount + this.config.merchant_salt
    )

    const postData = new URLSearchParams({
      merchant_id: this.config.merchant_id,
      merchant_oid,
      return_amount,
      paytr_token,
    }).toString()

    const result = await new Promise<Record<string, string>>((resolve, reject) => {
      const req = https.request(
        {
          hostname: "www.paytr.com",
          path: "/odeme/iade",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(postData),
          },
        },
        (res) => {
          let body = ""
          res.on("data", (chunk) => (body += chunk))
          res.on("end", () => {
            try { resolve(JSON.parse(body)) } catch { reject(new Error(`PayTR refund parse error: ${body}`)) }
          })
        }
      )
      req.on("error", reject)
      req.write(postData)
      req.end()
    })

    if (result.status !== "success") {
      throw new Error(`PayTR refund failed: [${result.err_no}] ${result.err_msg}`)
    }

    return { data: { ...sessionData, last_refund_amount: return_amount } }
  }

  async cancelPayment(data: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return {
      data: { ...(data.data ?? {}), status: "canceled" },
    }
  }

  async deletePayment(data: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: data.data ?? {} }
  }

  async retrievePayment(data: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: data.data ?? {} }
  }

  /**
   * Called when amount/currency changes (e.g. user updates cart).
   * If the amount changes, the stored iframe_token is no longer valid;
   * the storefront should call /store/paytr/token again to get a new one.
   */
  async updatePayment(data: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const existing = (data.data ?? {}) as Record<string, unknown>

    if (data.amount !== undefined && data.currency_code !== undefined) {
      return {
        data: {
          ...existing,
          amount: Number(data.amount),
          currency: data.currency_code.toUpperCase(),
          // Clear confirmation since a new payment is needed
          paytr_confirmed: false,
        },
      }
    }

    // Pure data update (e.g., webhook sets paytr_confirmed)
    return { data: existing }
  }

  async getPaymentStatus(data: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const sessionData = (data.data ?? {}) as Record<string, unknown>

    if (sessionData.paytr_confirmed === true) {
      return { status: PaymentSessionStatus.AUTHORIZED }
    }

    if (sessionData.status === "captured") {
      return { status: PaymentSessionStatus.CAPTURED }
    }

    if (sessionData.status === "canceled") {
      return { status: PaymentSessionStatus.CANCELED }
    }

    return { status: PaymentSessionStatus.PENDING }
  }

  /**
   * Called by Medusa's payment webhook subscriber after receiving a webhook event.
   * Validates the PayTR callback hash and returns the appropriate payment action.
   *
   * NOTE: The session data should already have paytr_confirmed=true at this point
   * because our custom webhook route (/store/paytr/webhook) updates it before
   * emitting the PaymentWebhookEvents.WebhookReceived event.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const body = (payload.data ?? {}) as Record<string, string>

    const { merchant_oid, status, total_amount, hash } = body

    if (!merchant_oid || !status || !total_amount || !hash) {
      return { action: "not_supported" }
    }

    const isValid = this.validateWebhookHash({ merchant_oid, status, total_amount, hash })
    if (!isValid) {
      return { action: "not_supported" }
    }

    if (status === "success") {
      return {
        action: "captured", // PaymentActions.SUCCESSFUL = "captured"
        data: {
          session_id: merchant_oid, // merchant_oid === Medusa session_id (set in initiatePayment)
          amount: parseInt(total_amount, 10),
        },
      }
    }

    // status === "failed"
    return { action: "failed" }
  }
}

export default PayTRProviderService

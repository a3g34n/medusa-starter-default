import crypto from "crypto"
import https from "https"

export type PayTRConfig = {
  merchant_id: string
  merchant_key: string
  merchant_salt: string
  merchant_ok_url: string
  merchant_fail_url: string
  test_mode?: boolean
  max_installment?: number
  debug?: boolean
}

/**
 * Map Medusa ISO 4217 currency code to PayTR currency value.
 * PayTR uses "TL" for Turkish Lira, not the ISO code "TRY".
 */
function toPayTRCurrency(currency_code: string): string {
  const map: Record<string, string> = { TRY: "TL" }
  return map[currency_code.toUpperCase()] ?? currency_code.toUpperCase()
}

/**
 * Compute HMAC-SHA256 base64 of message using merchant_key.
 */
function hmac(message: string, merchantKey: string): string {
  return crypto
    .createHmac("sha256", merchantKey)
    .update(message)
    .digest("base64")
}

/**
 * Standalone function to get a PayTR iframe token.
 * This does NOT require instantiating PayTRProviderService.
 */
export async function getPayTRIframeToken(
  config: PayTRConfig,
  params: {
    user_ip: string
    merchant_oid: string
    email: string
    payment_amount: number
    user_basket: string
    currency: string
    user_name?: string
    user_address?: string
    user_phone?: string
    no_installment?: number
    max_installment?: number
  }
): Promise<{ status: "success"; token: string } | { status: "failed"; reason: string }> {
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
    max_installment = config.max_installment ?? 0,
  } = params

  const currency = toPayTRCurrency(params.currency)
  const test_mode = config.test_mode ? "1" : "0"
  const debug_on = config.debug ? "1" : "0"

  const hashStr = [
    config.merchant_id,
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

  const paytr_token = hmac(hashStr + config.merchant_salt, config.merchant_key)

  const postData = new URLSearchParams({
    merchant_id: config.merchant_id,
    merchant_key: config.merchant_key,
    merchant_salt: config.merchant_salt,
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
    merchant_ok_url: config.merchant_ok_url,
    merchant_fail_url: config.merchant_fail_url,
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

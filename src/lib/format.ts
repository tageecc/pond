/** Currency code; matches localStorage preferred_currency and backend FX display */
export type Currency = "USD" | "CNY"

export function formatCurrency(
  amountUSD: number,
  currency: Currency,
  exchangeRate: number
): string {
  if (currency === "CNY") {
    return `¥${(amountUSD * exchangeRate).toFixed(2)}`
  }
  return `$${amountUSD.toFixed(2)}`
}

export function prettyTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

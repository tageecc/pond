import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import type { Currency } from "../lib/format"
import { formatCurrency as formatCurrencyFn } from "../lib/format"

const CURRENCY_STORAGE_KEY = "preferred_currency"

function readStoredCurrency(): Currency {
  const saved = localStorage.getItem(CURRENCY_STORAGE_KEY)
  return saved === "CNY" || saved === "USD" ? saved : "USD"
}

export function useCurrency() {
  const [currency, setCurrency] = useState<Currency>(readStoredCurrency)
  const [exchangeRate, setExchangeRate] = useState<number>(7.0)

  useEffect(() => {
    invoke<number>("get_exchange_rate").then(setExchangeRate).catch(() => {})
  }, [])

  const toggleCurrency = () => {
    const next: Currency = currency === "USD" ? "CNY" : "USD"
    setCurrency(next)
    localStorage.setItem(CURRENCY_STORAGE_KEY, next)
  }

  const formatCurrency = (amountUSD: number) =>
    formatCurrencyFn(amountUSD, currency, exchangeRate)

  return {
    currency,
    exchangeRate,
    toggleCurrency,
    formatCurrency,
  }
}

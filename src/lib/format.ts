/** Shared money formatting. Currency is set in Settings (stored as `jess:currency`). */

export function getCurrency(): string {
  try {
    const raw = localStorage.getItem('jess:currency')
    return raw ? JSON.parse(raw) : 'USD'
  } catch {
    return 'USD'
  }
}

export function money(n: number, opts?: Intl.NumberFormatOptions): string {
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency: getCurrency(), maximumFractionDigits: 0, ...opts })
  } catch {
    return `$${Math.round(n).toLocaleString()}`
  }
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'BRL', 'JPY', 'INR']

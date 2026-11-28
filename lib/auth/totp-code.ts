export function isTotpCode(value: string): boolean {
  return /^\d{6,8}$/.test(value);
}

export function normaliseTotpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

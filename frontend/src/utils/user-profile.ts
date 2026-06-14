/**
 * Fonte única de verdade pro perfil pessoal.
 * Todos os defaults de cálculos PK/HR derivam daqui.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Tanaka, Monahan, Seals (2001) JACC 37:153-156 — menor viés que Fox-Haskell (220−idade).
export function estimateHrMaxByAge(age: number): number {
  return Math.round(208 - 0.7 * age)
}

export function getCurrentAge(): number {
  const birthYear = USER_PROFILE.birthYear
  return new Date().getFullYear() - birthYear
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const USER_PROFILE = {
  name: 'Anders',
  weightKg: 91,
  birthYear: 1986,
  age: 40,
  sex: 'M',
  timezone: 'America/Sao_Paulo',
} as const

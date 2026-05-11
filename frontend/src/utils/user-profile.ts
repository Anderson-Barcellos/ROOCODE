/**
 * Fonte única de verdade pro perfil pessoal.
 * Todos os defaults de cálculos PK/HR derivam daqui.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function estimateHrMaxByAge(age: number): number {
  return 220 - age
}

export function getCurrentAge(): number {
  const birthYear = USER_PROFILE.birthYear
  return new Date().getFullYear() - birthYear
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const USER_PROFILE = {
  name: 'Anders',
  weightKg: 91,
  birthYear: 1987,
  age: 39,
  hrMaxBpm: 181, // 220 − 39
  sex: 'M',
  timezone: 'America/Sao_Paulo',
} as const

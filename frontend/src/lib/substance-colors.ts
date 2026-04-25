export const SUBSTANCE_COLORS: Record<string, string> = {
  lexapro: '#14b8a6',
  venvanse: '#8b5cf6',
  lamictal: '#3b82f6',
  clonazepam: '#f59e0b',
  bacopa_monnieri: '#84cc16',
  magnesio_treonato: '#0891b2',
  vitamina_d3_10000_ui: '#eab308',
  omega_3: '#06b6d4',
  piracetam: '#a855f7',
}

export const getSubstanceColor = (id: string): string =>
  SUBSTANCE_COLORS[id] ?? '#8b5cf6'

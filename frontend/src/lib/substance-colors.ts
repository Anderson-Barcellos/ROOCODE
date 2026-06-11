export const SUBSTANCE_COLORS: Record<string, string> = {
  lexapro: '#0f9f8f',
  venvanse: '#d97706',
  lamictal: '#2563eb',
  clonazepam: '#7c3aed',
  bacopa_monnieri: '#84cc16',
  magnesio_treonato: '#0891b2',
  vitamina_d3_10000_ui: '#eab308',
  omega_3: '#06b6d4',
  piracetam: '#a855f7',
}

export const getSubstanceColor = (id: string): string =>
  SUBSTANCE_COLORS[id] ?? '#8b5cf6'

/**
 * Helpers de formatação compartilhados pelos heatmaps de correlação.
 * Mantidos fora de heatmap-cell.tsx por exigência do react-refresh
 * (Fast refresh quebra quando arquivo de componente exporta funções).
 */

export function formatR(r: number): string {
  if (!Number.isFinite(r)) return '—'
  return r.toFixed(2)
}

export function formatP(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—'
  if (p < 0.001) return '<0.001'
  if (p < 0.01) return p.toFixed(3)
  return p.toFixed(2)
}

export function formatCi(
  lower: number | null | undefined,
  upper: number | null | undefined,
): string {
  if (lower == null || upper == null || !Number.isFinite(lower) || !Number.isFinite(upper)) {
    return 'sem IC95%'
  }
  return `[${lower.toFixed(2)}, ${upper.toFixed(2)}]`
}

export function heatmapColorForR(r: number): string {
  const clamped = Math.max(-1, Math.min(1, r))
  const intensity = Math.abs(clamped)
  if (clamped < 0) return `rgba(239, 68, 68, ${intensity * 0.45})`
  if (clamped > 0) return `rgba(20, 184, 166, ${intensity * 0.45})`
  return 'rgba(241, 245, 249, 1)'
}

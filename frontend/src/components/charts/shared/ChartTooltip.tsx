import { Tooltip } from 'recharts'
import type { ComponentProps } from 'react'

import { TOOLTIP_DEFAULTS } from './tooltip-helpers'

/**
 * Tooltip padrão de todos os charts. Embute `TOOLTIP_DEFAULTS` (posição fixa no
 * topo, x segue o cursor) num único componente — mudar o comportamento global do
 * tooltip é editar este arquivo. Charts novos só precisam usar `<ChartTooltip>`
 * em vez de `<Tooltip>` e herdam o comportamento automaticamente.
 */
export function ChartTooltip(props: ComponentProps<typeof Tooltip>) {
  return <Tooltip {...TOOLTIP_DEFAULTS} {...props} />
}

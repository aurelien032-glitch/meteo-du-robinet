import { useMemo } from 'react'
import Chart, { axisDefaults, lineDefaults } from './Chart'
import { fmt } from '../lib/data'
import { chartPalette, useCleTheme } from '../lib/theme'
import type { Piezometre } from '../lib/types'

/**
 * Niveau mensuel d'un piézomètre sur les `mois` derniers mois, dans la bande de ses années passées : entre le
 * 10e et le 90e centile du même mois calendaire (aplat), médiane en pointillé. Sous la bande : nappe basse
 * pour la saison ; au-dessus : haute. Les trous de mesure restent visibles.
 */
export default function PiezoChart({ p, mois = 36, height = 260, code }: { p: Piezometre; mois?: number; height?: number; code: string }) {
  const cle = useCleTheme()
  const option = useMemo(() => {
    const c = chartPalette()
    const serie = p.serie.slice(-mois)
    const x = serie.map(([m]) => m)
    const norm = (i: number) => p.normale[x[i].slice(5, 7)]
    const bas = x.map((_, i) => norm(i)?.[0] ?? null)
    const ecart = x.map((_, i) => {
      const n = norm(i)
      return n && n[0] != null && n[2] != null ? n[2] - n[0] : null
    })
    return {
      grid: { left: 56, right: 16, top: 58, bottom: 28 },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (ps: unknown) => {
          const i = (ps as { dataIndex: number }[])[0]?.dataIndex ?? 0
          const n = norm(i)
          return `<b>${x[i]}</b><br>niveau ${serie[i][1] == null ? '–' : `${fmt.dec(serie[i][1]!, 2)} m`}${n ? `<br>normale ${fmt.dec(n[1] ?? 0, 2)} m (de ${fmt.dec(n[0] ?? 0, 2)} à ${fmt.dec(n[2] ?? 0, 2)})` : ''}`
        },
      },
      legend: { top: 0, data: ['niveau du mois', 'médiane des années passées', 'années passées (10 % – 90 %)'], textStyle: { color: c.muted, fontSize: c.fontSize } },
      xAxis: { type: 'category' as const, data: x, ...axisDefaults(), axisLabel: { color: c.muted, fontSize: c.fontSize, interval: 5 } },
      yAxis: { type: 'value' as const, scale: true, name: 'm NGF', nameGap: 10, ...axisDefaults() },
      series: [
        // stackStrategy 'all' : sinon ECharts empile à part valeurs positives et négatives, et la bande d'une nappe
        // sous le niveau de la mer (m NGF négatifs) se dessinait depuis zéro au lieu de partir du 10e centile.
        { type: 'line' as const, name: 'bas', data: bas, stack: 'bande', stackStrategy: 'all' as const, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
        {
          type: 'line' as const,
          name: 'années passées (10 % – 90 %)',
          data: ecart,
          stack: 'bande',
          stackStrategy: 'all' as const,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color: c.grid, opacity: 0.9 },
          itemStyle: { color: c.grid },
          silent: true,
        },
        { type: 'line' as const, name: 'médiane des années passées', data: x.map((_, i) => norm(i)?.[1] ?? null), symbol: 'none', lineStyle: { type: 'dashed' as const, width: 1.5, color: c.muted }, itemStyle: { color: c.muted } },
        { type: 'line' as const, name: 'niveau du mois', data: serie.map(([, v]) => v), ...lineDefaults(c.series[0]), symbolSize: 4 },
      ],
    }
  }, [p, mois, cle])
  return <Chart option={option} height={height} exportName={`piezometre-${code.replace(/\W+/g, '-')}`} />
}

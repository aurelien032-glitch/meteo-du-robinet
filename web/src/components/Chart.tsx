import { useEffect, useRef } from 'react'
// Import modulaire (audit du 2026-09-22) : `import * as echarts from 'echarts'` embarquait toute la
// bibliothèque — les ~15 types de séries et tous les composants — pour trois types de séries réellement
// utilisés sur le site (bar/line/scatter) et deux composants (tooltip/legend). Chunk « Home » ramené de
// 1,14 Mo à sa part utile ; si un nouveau graphique a besoin d'un type de série absent de la liste
// ci-dessous, l'ajouter ici (`echarts.use([...])`), pas relancer un `import * as echarts from 'echarts'`.
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { chartPalette, cssVar, isDark } from '../lib/theme'

// Import modulaire : un composant ECharts non enregistré ici (MarkLineComponent, par exemple, qu'une option
// `markLine` demanderait) disparaît en silence, sans erreur de build ni d'exécution. La seule ligne de limite des
// fiches est désormais dessinée en SVG (components/SerieMensuelle.tsx).
echarts.use([BarChart, LineChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type Props = { option: EChartsOption; height?: number | string; onReady?: (chart: echarts.ECharts) => void; exportName?: string }

/** Enveloppe ECharts : applique la palette CSS, se redimensionne, suit le thème, exporte en PNG. */
export default function Chart({ option, height = 320, onReady, exportName = 'graphique' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const p = chartPalette()
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas', devicePixelRatio: 2 })
    chartRef.current = chart
    chart.setOption({
      color: p.series,
      textStyle: { fontFamily: p.fontFamily, color: p.text, fontSize: p.fontSize },
      backgroundColor: 'transparent',
      animationDuration: 600,
      ...withFrenchAxes(withTooltipStyle(option)),
    })
    onReady?.(chart)
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(ref.current)
    const mo = new MutationObserver(() => {
      const q = chartPalette()
      chart.setOption({ color: q.series, textStyle: { color: q.text, fontFamily: q.fontFamily, fontSize: q.fontSize } })
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => {
      ro.disconnect()
      mo.disconnect()
      chart.dispose()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(withFrenchAxes(withTooltipStyle(option)), { notMerge: false })
  }, [option])

  return (
    <div className="chart-wrap" style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%', height }} />
      <button
        type="button"
        className="btn chart-export"
        title="Exporter en PNG haute résolution"
        onClick={() => chartRef.current && exportPng(chartRef.current, exportName)}
      >
        PNG
      </button>
    </div>
  )
}

/** Info-bulle aux couleurs du thème (surface, bordure, texte), même police et même corps que le reste. */
export function withTooltipStyle(option: EChartsOption): EChartsOption {
  const o = option as Record<string, unknown>
  if (!o.tooltip) return option
  const p = chartPalette()
  const base = {
    // Format français par défaut : sans lui, ECharts écrivait « 16,229 » pour 16 229 (revue du 2026-09-22).
    // Une page qui veut son propre format (unité, part) passe son valueFormatter, qui l'emporte.
    valueFormatter: (v: unknown) => (typeof v === 'number' ? nfFr.format(v) : v == null ? '–' : String(v)),
    backgroundColor: p.bg,
    borderColor: cssVar('--border'),
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: p.text, fontSize: p.fontSize, fontFamily: p.fontFamily },
    // --shadow-pop (pas une valeur en dur) : en sombre/studio son opacité monte à .45, sans quoi l'ombre
    // resterait calibrée pour un fond clair et deviendrait presque invisible sur un fond sombre.
    extraCssText: `box-shadow: ${cssVar('--shadow-pop')}; border-radius: 8px;`,
    confine: true,
  }
  return { ...option, tooltip: { ...base, ...(o.tooltip as Record<string, unknown>) } } as EChartsOption
}

const nfFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })
type Axis = { type?: string; axisLabel?: { formatter?: unknown } & Record<string, unknown> } & Record<string, unknown>

/** Les axes numériques sans formateur reçoivent l'écriture française (« 10 000 », pas « 10,000 »). */
export function withFrenchAxes(option: EChartsOption): EChartsOption {
  const fix = (axes: unknown, defaultValue: boolean) => {
    if (!axes) return axes
    const list = (Array.isArray(axes) ? axes : [axes]) as Axis[]
    const out = list.map((a) => {
      const numeric = a.type === 'value' || a.type === 'log' || (defaultValue && a.type === undefined)
      if (!numeric || a.axisLabel?.formatter) return a
      return { ...a, axisLabel: { ...a.axisLabel, formatter: (v: number) => nfFr.format(v) } }
    })
    return Array.isArray(axes) ? out : out[0]
  }
  const o = option as Record<string, unknown>
  const out: Record<string, unknown> = { ...o }
  if (o.xAxis) out.xAxis = fix(o.xAxis, false)
  if (o.yAxis) out.yAxis = fix(o.yAxis, true)
  return out as EChartsOption
}

/** Exporte un graphique en PNG haute résolution (pour les vidéos). */
export function exportPng(chart: echarts.ECharts, name = 'graphique') {
  const url = chart.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: chartPalette().bg })
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.png`
  a.click()
}

/** Options communes d'axes lisibles dans les deux thèmes. */
export function axisDefaults() {
  const p = chartPalette()
  return {
    axisLine: { lineStyle: { color: p.grid } },
    axisTick: { show: false },
    axisLabel: { color: p.muted, fontSize: p.fontSize },
    nameTextStyle: { color: p.muted, fontSize: p.fontSize },
    splitLine: { lineStyle: { color: p.grid } },
  }
}

/**
 * Style d'une barre de millésime en cours : estompée et hachurée, pour qu'une année incomplète ne se lise
 * pas comme une baisse. Toujours accompagnée du libellé « (en cours) » sur l'axe (yearLabel).
 */
export function partielItemStyle() {
  // Hachures claires sur fond clair (barre saturée) ; hachures sombres sur fond sombre (barre éclaircie) —
  // toujours blanches, elles se noyaient dans les barres du thème sombre, plus claires (revue du 2026-09-22).
  const color = isDark() ? 'rgba(12, 26, 36, 0.55)' : 'rgba(255, 255, 255, 0.6)'
  return {
    opacity: 0.5,
    decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: -Math.PI / 4, color },
  }
}

/** Ligne à pas annuels ou mensuels : segments droits, points visibles, trous laissés vides. */
export function lineDefaults(color: string) {
  return { smooth: false, connectNulls: false, symbol: 'circle', symbolSize: 6, showSymbol: true, lineStyle: { width: 2, color }, itemStyle: { color } }
}

/**
 * Nuage de points : n'étiquette que les points extrêmes (les `n` plus hauts sur chaque axe), le reste passe
 * par l'info-bulle. Étiqueter les cent départements les empile en une masse illisible.
 */
export function etiquetterExtremes<T extends { value: unknown[] }>(pts: T[], n: number): (T & { label?: { show: boolean } })[] {
  const top = (k: number) => new Set([...pts].sort((a, b) => Number(b.value[k]) - Number(a.value[k])).slice(0, n))
  const garder = new Set([...top(0), ...top(1)])
  return pts.map((p) => (garder.has(p) ? { ...p, label: { show: true } } : p))
}

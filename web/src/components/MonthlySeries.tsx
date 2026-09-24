import { useMemo } from 'react'
import Chargement from './Chargement'
import Chart, { axisDefaults, lineDefaults } from './Chart'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import type { SeriesFile } from '../lib/types'

/**
 * Série mensuelle d'un paramètre, en panneaux superposés qui partagent l'axe du temps : part des analyses
 * au-dessus de la limite, part des analyses quantifiées, puis (en national) médiane et 90e centile.
 * Un axe vertical par panneau, jamais deux sur le même dessin : les deux parts n'ont pas le même ordre de
 * grandeur et, superposées, sembleraient comparables. Conçu pour les animations « mois par mois » des vidéos.
 */
export default function MonthlySeries({ code, dept, height = 316 }: { code: string; dept?: string; height?: number }) {
  const cle = useCleTheme()
  const s = useJson<SeriesFile>(`series/${code}.json`).data
  const option = useMemo(() => {
    if (!s) return null
    const p = chartPalette()
    const src = dept ? s.depts[dept] : s.national
    if (!src) return null
    // L'axe s'arrête au dernier mois analysé : les mois à venir du millésime en cours ne sont pas des trous.
    const fin = fenetre(s, dept)
    const n = (src.n as (number | null)[]).slice(0, fin)
    const pctDep = n.map((v, i) => (v ? _n((100 * (src.nd[i] ?? 0)) / v) : null))
    const pctQuant = n.map((v, i) => (v ? _n((100 * (src.nq[i] ?? 0)) / v) : null))
    const labels = s.mois.slice(0, fin).map((m) => (m.endsWith('-01') ? m.slice(0, 4) : m.slice(5)))
    const panneaux: { nom: string; series: object[]; max?: number }[] = [
      { nom: '% au-dessus de la limite', series: [{ type: 'bar', name: 'au-dessus de la limite (%)', data: pctDep, itemStyle: { color: p.mark, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 12 }] },
      { nom: '% quantifiées', series: [{ type: 'line', name: 'quantifiées (%)', data: pctQuant, ...lineDefaults(p.series[0]), symbolSize: 4 }], max: 100 },
    ]
    if (!dept)
      panneaux.push({
        nom: s.u ?? '',
        series: [
          { type: 'line', name: 'médiane', data: s.national.p50.slice(0, fin), ...lineDefaults(p.series[2]), symbolSize: 4 },
          { type: 'line', name: '90e centile', data: s.national.p90.slice(0, fin), ...lineDefaults(p.series[3]), symbolSize: 4 },
        ],
      })
    // Géométrie en pixels : légende en haut, un intervalle pour le nom de l'axe de chaque panneau, les
    // libellés de mois sous le dernier panneau seulement.
    const top = 52
    const bottom = 26
    const gap = 30
    const h = (height - top - bottom - gap * (panneaux.length - 1)) / panneaux.length
    const derniere = panneaux.length - 1
    return {
      grid: panneaux.map((_, i) => ({ left: 56, right: 16, top: top + i * (h + gap), height: h })),
      axisPointer: { link: [{ xAxisIndex: 'all' as const }] },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : fmt.dec(Number(v), 2)) },
      legend: { top: 0, type: 'scroll' as const, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: panneaux.map((_, i): object => ({
        type: 'category',
        data: labels,
        gridIndex: i,
        ...axisDefaults(),
        axisLabel: { show: i === derniere, color: p.muted, fontSize: p.fontSize, interval: 2 },
      })),
      yAxis: panneaux.map((x, i): object => ({
        type: 'value',
        gridIndex: i,
        name: x.nom,
        nameGap: 8,
        max: x.max,
        splitNumber: 2,
        ...axisDefaults(),
        nameTextStyle: { color: p.muted, fontSize: p.fontSize, align: 'left' as const },
      })),
      series: panneaux.flatMap((x, i) => x.series.map((se): object => ({ ...se, xAxisIndex: i, yAxisIndex: i }))),
    }
  }, [s, dept, height, cle])
  if (!s) return <Chargement texte="Chargement de la série…" />
  if (!option) return <p className="muted">Pas de série pour ce département.</p>
  return (
    <>
      <Chart option={option} height={height} exportName={`serie-${code}`} />
      <div className="source">
        {s.l}, {s.mois[0]} → {s.mois[fenetre(s, dept) - 1]}. Part mensuelle des analyses au-dessus de la limite de qualité{s.lim ? ` (${s.lim})` : ''} et part des
        analyses quantifiées. Les moyennes ne sont pas affichées : les résultats sous le seuil de quantification valent 0.
      </div>
    </>
  )
}

/** Nombre de mois à afficher : jusqu'au dernier mois avec au moins une analyse. */
function fenetre(s: SeriesFile, dept?: string): number {
  const n = ((dept ? s.depts[dept] : s.national)?.n ?? []) as (number | null)[]
  let fin = n.length
  while (fin > 1 && !n[fin - 1]) fin--
  return fin
}

function _n(x: number): number {
  return Math.round(x * 100) / 100
}

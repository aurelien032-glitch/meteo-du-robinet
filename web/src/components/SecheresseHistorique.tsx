import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Chart, { axisDefaults, lineDefaults, partielItemStyle } from './Chart'
import { couleurNiveau } from './VigiEauMap'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import type { SecheresseHist } from '../lib/types'

const LIBELLES = ['vigilance', 'alerte', 'alerte renforcée', 'crise']

/** Jour de l'année → « 15 juil. ». */
function jourFr(annee: string, i: number): string {
  return new Date(Number(annee), 0, 1 + i).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Historique des restrictions sécheresse depuis 2012 (arrêtés préfectoraux) : ce que VigiEau, qui ne donne que le
 * jour même, ne permet pas de voir. Année choisie dans l'URL (?hist=), comparée à l'année record.
 */
export default function SecheresseHistorique() {
  const cle = useCleTheme()
  const h = useJson<SecheresseHist>('secheresse/historique.json').data
  const { names } = useDepartements()
  const [sp, setSp] = useSearchParams()
  const derniere = h?.annees[h.annees.length - 1]
  const annee = h && h.annees.includes(sp.get('hist') ?? '') ? sp.get('hist')! : derniere
  // Année de comparaison : celle qui a cumulé le plus de jours-départements en crise, hors année choisie.
  const record = useMemo(() => {
    if (!h) return undefined
    return h.annees.filter((a) => a !== annee).reduce((a, b) => ((h.national[b]?.jours[3] ?? 0) > (h.national[a]?.jours[3] ?? 0) ? b : a), h.annees[0])
  }, [h, annee])

  const parAnnee = useMemo(() => {
    if (!h) return null
    const p = chartPalette()
    return {
      grid: { left: 60, right: 12, top: 40, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => `${fmt.int(Number(v))} jours-départements` },
      legend: { top: 0, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: h.annees.map((a) => (a === derniere ? `${a} (en cours)` : a)), ...axisDefaults() },
      yAxis: { type: 'value' as const, ...axisDefaults() },
      series: ['vigilance', 'alerte', 'alerte_renforcee', 'crise'].map((cle, i) => ({
        type: 'bar' as const,
        name: LIBELLES[i],
        stack: 'j',
        barMaxWidth: 34,
        itemStyle: { color: couleurNiveau(cle) },
        data: h.annees.map((a) => {
          const v = h.national[a]?.jours[i] ?? 0
          return a === derniere ? { value: v, itemStyle: partielItemStyle() } : v
        }),
      })),
    }
  }, [h, derniere, cle])

  const saison = useMemo(() => {
    if (!h || !annee || !record) return null
    const p = chartPalette()
    const serie = (a: string) => (h.quotidien[a] ?? []).map((c) => c[3])
    const jours = Array.from({ length: 366 }, (_, i) => jourFr(annee, i))
    return {
      grid: { left: 44, right: 12, top: 40, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : `${fmt.int(Number(v))} départements`) },
      legend: { top: 0, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: jours, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize, interval: 30 } },
      yAxis: { type: 'value' as const, ...axisDefaults() },
      series: [
        { type: 'line' as const, name: `${annee}`, data: serie(annee), ...lineDefaults(p.markHi), showSymbol: false, lineStyle: { width: 2.5, color: p.markHi } },
        { type: 'line' as const, name: `${record} (année record)`, data: serie(record), ...lineDefaults(p.muted), showSymbol: false, lineStyle: { width: 1.5, type: 'dashed' as const, color: p.muted } },
      ],
    }
  }, [h, annee, record, cle])

  if (!h || !annee) return null
  const classement = Object.entries(h.depts)
    .map(([dd, parAn]) => ({ dd, j: parAn[annee] }))
    .filter((r) => r.j && r.j[1] + r.j[2] + r.j[3] > 0)
    .sort((a, b) => b.j![3] - a.j![3] || b.j![2] - a.j![2])
  const nat = h.national[annee]

  return (
    <>
      <div className="toolbar">
        <h2>Depuis 2012 : les arrêtés sécheresse, jour par jour</h2>
        <label>
          Année{' '}
          <select
            value={annee}
            onChange={(e) => {
              const next = new URLSearchParams(sp)
              if (e.target.value === derniere) next.delete('hist')
              else next.set('hist', e.target.value)
              setSp(next, { replace: true })
            }}
          >
            {[...h.annees].reverse().map((a) => (
              <option key={a} value={a}>
                {a === derniere ? `${a} (en cours)` : a}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h3>Jours de restriction cumulés, par année</h3>
          {parAnnee && <Chart option={parAnnee} height={320} exportName="secheresse-annees" />}
          <div className="source">Somme sur les départements des jours passés à chaque niveau (le plus grave en vigueur sur l'une de leurs zones).</div>
        </div>
        <div className="card">
          <h3>
            {annee} : départements en crise, jour par jour
          </h3>
          {saison && <Chart option={saison} height={320} exportName={`secheresse-saison-${annee}`} />}
          <div className="source">
            {nat ? `${nat.depts_crise} départements passés au moins un jour en crise en ${annee}, ${nat.depts_touches} concernés par un arrêté.` : ''}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Départements les plus longtemps en crise en {annee}</h3>
        <div className="table-scroll"><table className="data">
          <caption className="sr-only">Départements classés par nombre de jours en crise pendant l'année choisie</caption>
          <thead>
            <tr>
              <th>Département</th>
              <th className="num">Jours en crise</th>
              <th className="num">Alerte renforcée</th>
              <th className="num">Alerte</th>
            </tr>
          </thead>
          <tbody>
            {classement.slice(0, 15).map((r) => (
              <tr key={r.dd}>
                <td>
                  <Link to={`/departement/${r.dd}`}>{names.get(r.dd) ?? r.dd}</Link> <span className="muted">({r.dd})</span>
                </td>
                <td className="num">
                  <b>{fmt.int(r.j![3])}</b>
                </td>
                <td className="num">{fmt.int(r.j![2])}</td>
                <td className="num">{fmt.int(r.j![1])}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="source">
          Arrêtés préfectoraux de restriction (jeu « Donnée Sécheresse », VigiEau, qui succède à Propluvia), mis à jour le {h.maj}. Un département
          compte un jour « en crise » si l'une de ses zones d'alerte l'est : ce n'est pas tout le territoire. Les niveaux ne sont renseignés qu'à
          partir de 2012.
        </div>
      </div>
    </>
  )
}

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Chart, { axisDefaults, lineDefaults, partielItemStyle } from './Chart'
import { couleurNiveau } from './VigiEauMap'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import type { SecheresseHist } from '../lib/types'
import { lienDepartement } from '../lib/parcours'
import { useAnneeDansAdresse } from '../lib/year'

const LIBELLES = ['vigilance', 'alerte', 'alerte renforcée', 'crise']

/** Jour de l'année → « 15 juil. ». */
function jourFr(annee: string, i: number): string {
  return new Date(Number(annee), 0, 1 + i).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Historique des restrictions sécheresse depuis 2012 (arrêtés préfectoraux) : ce que VigiEau, qui ne donne que le
 * jour même, ne permet pas de voir. L'année choisie, comparée à l'année record, est toujours écrite dans l'adresse
 * (?hist=), comme celle des barres d'année ; par défaut l'année en cours, la sécheresse suivant la saison (Méthode).
 */
export default function SecheresseHistorique() {
  const cle = useCleTheme()
  const h = useJson<SecheresseHist>('secheresse/historique.json').data
  const { names } = useDepartements()
  const [sp, setSp] = useSearchParams()
  const derniere = h?.annees[h.annees.length - 1]
  const annee = h && h.annees.includes(sp.get('hist') ?? '') ? sp.get('hist')! : derniere
  useAnneeDansAdresse('hist', annee ? Number(annee) : undefined)
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
      <h2>Historique des arrêtés sécheresse depuis 2012, jour par jour</h2>
      <div className="card">
        <h3>Jours de restriction cumulés, par année</h3>
        {parAnnee && <Chart option={parAnnee} height={320} exportName="secheresse-annees" />}
        <div className="source">
          Somme, sur l'ensemble des départements, des jours passés à chaque niveau. Le niveau retenu pour un département est le plus grave en
          vigueur sur l'une de ses zones.
        </div>
      </div>
      {/* L'année au-dessus de ce qu'elle gouverne (règle de l'auteur, 23/09), sous le graphique qui les montre toutes.
          Une liste plutôt que la barre des autres pages, faite pour quatre années : il y en a quinze (choix de
          l'auteur, 26/09). */}
      <div className="barre-annee">
        <div>
          <p className="ba-titre">Année de l’historique</p>
          <p className="ba-note">Elle vaut pour la saison jour par jour et le classement ci-dessous ; le graphique ci-dessus montre toutes les années.</p>
        </div>
        <label>
          Année{' '}
          <select
            value={annee}
            onChange={(e) => {
              const next = new URLSearchParams(sp)
              next.set('hist', e.target.value)
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
          <h3>
            Nombre de départements en crise, jour par jour, en {annee}
          </h3>
          {saison && <Chart option={saison} height={320} exportName={`secheresse-saison-${annee}`} />}
          <div className="source">
            {nat ? `En ${annee}, ${nat.depts_crise} départements ont connu au moins un jour de crise et ${nat.depts_touches} ont fait l'objet d'au moins un arrêté.` : ''}
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
                    <Link to={lienDepartement(r.dd, { section: 'ressource' })}>{names.get(r.dd) ?? r.dd}</Link> <span className="muted">({r.dd})</span>
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
            Arrêtés préfectoraux de restriction (jeu « Donnée Sécheresse » de VigiEau, qui succède à Propluvia), mis à jour le {/^\d{4}-\d{2}-\d{2}$/.test(h.maj) ? fmt.date(h.maj) : h.maj}. Un jour
            est compté en crise pour un département dès que l'une de ses zones d'alerte atteint ce niveau, même si le reste de son territoire ne
            l'atteint pas. Les niveaux ne sont renseignés qu'à partir de 2012.
          </div>
        </div>
      </div>
    </>
  )
}

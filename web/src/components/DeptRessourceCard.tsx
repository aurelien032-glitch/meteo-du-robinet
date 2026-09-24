import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Chart, { axisDefaults } from './Chart'
import PiezoChart from './PiezoChart'
import { couleurNiveau } from './VigiEauMap'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { couleursClasses, moisFr } from '../lib/nappes'
import { chartPalette, useCleTheme } from '../lib/theme'
import type { NappesDept, NappesNational, SecheresseHist } from '../lib/types'

/** Ressource d'un département : jours de restriction sécheresse par année et nappes suivies ce mois-ci. */
export default function DeptRessourceCard({ dd }: { dd: string }) {
  const cle = useCleTheme()
  const hist = useJson<SecheresseHist>('secheresse/historique.json').data
  const nat = useJson<NappesNational>('nappes/national.json').data
  const nd = useJson<NappesDept>(`nappes/${dd}.json`).data
  const [choix, setChoix] = useState<string | null>(null)

  const option = useMemo(() => {
    if (!hist) return null
    const p = chartPalette()
    const h = hist.depts[dd] ?? {}
    return {
      grid: { left: 44, right: 8, top: 36, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => `${fmt.int(Number(v))} jours` },
      legend: { top: 0, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: hist.annees.map((a) => a.slice(2)), ...axisDefaults() },
      yAxis: { type: 'value' as const, max: 366, ...axisDefaults() },
      series: (['alerte', 'alerte_renforcee', 'crise'] as const).map((cle, i) => ({
        type: 'bar' as const,
        name: ['alerte', 'alerte renforcée', 'crise'][i],
        stack: 'j',
        barMaxWidth: 18,
        itemStyle: { color: couleurNiveau(cle) },
        data: hist.annees.map((a) => h[a]?.[i + 1] ?? 0),
      })),
    }
  }, [hist, dd, cle])

  if (!hist || !nat || !nd) return null
  const piezos = Object.entries(nd.piezometres).sort((a, b) => (a[1].classes[nat.mois_ref] ?? 9) - (b[1].classes[nat.mois_ref] ?? 9))
  const code = choix && nd.piezometres[choix] ? choix : piezos[0]?.[0]
  const couleurs = couleursClasses()

  return (
    <div className="grid cols-2" id="ressource">
      <div className="card">
        <h2>Restrictions sécheresse depuis 2012</h2>
        {option && <Chart option={option} height={260} exportName={`secheresse-${dd}`} />}
        <div className="source">
          Jours par an au niveau le plus grave en vigueur sur l'une des zones d'alerte du département (arrêtés préfectoraux, VigiEau).{' '}
          <Link to="/secheresse">En France</Link>.
        </div>
      </div>
      <div className="card">
        <h2>Nappes · {moisFr(nat.mois_ref)}</h2>
        {piezos.length === 0 ? (
          <p className="muted">Aucun piézomètre suivi depuis au moins 15 ans dans le département.</p>
        ) : (
          <>
            <label>
              Piézomètre{' '}
              <select value={code} onChange={(e) => setChoix(e.target.value)}>
                {piezos.map(([c, p]) => {
                  const k = p.classes[nat.mois_ref]
                  return (
                    <option key={c} value={c}>
                      {p.commune} · {k == null ? 'pas de mesure' : nat.classes[k]}
                    </option>
                  )
                })}
              </select>
            </label>
            {code && <PiezoChart p={nd.piezometres[code]} code={code} height={220} />}
            <p className="muted">
              {nat.classes.map((nom, k) => {
                const n = piezos.filter(([, p]) => p.classes[nat.mois_ref] === k).length
                return n ? (
                  <span key={k} style={{ marginRight: 'var(--s3)', whiteSpace: 'nowrap' }}>
                    <span className="swatch" style={{ background: couleurs[k] }} aria-hidden="true" /> {n} {nom}
                  </span>
                ) : null
              })}
            </p>
          </>
        )}
        <div className="source">
          Piézométrie Hub'Eau (BRGM), niveau du mois comparé aux mêmes mois passés. <Link to="/nappes">Les nappes en France</Link>.
        </div>
      </div>
    </div>
  )
}

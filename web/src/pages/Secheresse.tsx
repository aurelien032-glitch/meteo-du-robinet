import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { fmt } from '../lib/data'
import SecheresseHistorique from '../components/SecheresseHistorique'
import VigiEauMap, { NIVEAUX, RESSOURCES, couleurNiveau, useVigiEau, type Ressource } from '../components/VigiEauMap'
import { usePageTitle } from '../lib/title'
import Kpi from '../components/Kpi'
import { TONS_SECHERESSE } from '../lib/vigieau'

/** Restrictions sécheresse en vigueur aujourd'hui, dans toute la France, en direct. */
export default function Secheresse() {
  usePageTitle('Sécheresse : restrictions du jour', "Niveaux de restriction d'usage de l'eau en vigueur aujourd'hui, département par département.")
  // Ressource dans l'URL (?ressource=), comme l'indicateur des autres cartes ; « niveau maximal » par défaut.
  const [sp, setSp] = useSearchParams()
  const ressource = RESSOURCES.find((r) => r.key === sp.get('ressource'))?.key ?? 'max'
  const setRessource = (k: Ressource) => {
    const next = new URLSearchParams(sp)
    if (k === 'max') next.delete('ressource')
    else next.set('ressource', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
  const { depts, error } = useVigiEau()
  const field = RESSOURCES.find((r) => r.key === ressource)!.field
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const d of depts ?? []) {
      const k = (d[field] as string | null) ?? 'pas_de_restriction'
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [depts, field])
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const ranking = (depts ?? [])
    .map((d) => ({ d, n: NIVEAUX.find((n) => n.key === ((d[field] as string | null) ?? 'pas_de_restriction')) }))
    .filter((x) => x.n && x.n.ordre >= 2)
    .sort((a, b) => b.n!.ordre - a.n!.ordre || a.d.nom.localeCompare(b.d.nom))

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: 'Sécheresse' }]} />
      <div className="toolbar">
        <div>
          <h1>Sécheresse : les restrictions du jour</h1>
          <p className="lead">Situation au {today}, interrogée en direct chez VigiEau. Le niveau change au fil des arrêtés préfectoraux.</p>
        </div>
        <label>
          Ressource{' '}
          <select value={ressource} onChange={(e) => setRessource(e.target.value as Ressource)}>
            {RESSOURCES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p className="card muted">VigiEau injoignable ({error}). Les compteurs ne peuvent pas être calculés ; réessayez dans quelques minutes.</p>
      ) : (
        <div className="grid cols-4">
          <Kpi value={depts ? fmt.int(counts.crise ?? 0) : '–'} label="départements en crise" ton={TONS_SECHERESSE[4]} />
          <Kpi value={depts ? fmt.int(counts.alerte_renforcee ?? 0) : '–'} label="en alerte renforcée" ton={TONS_SECHERESSE[3]} />
          <Kpi value={depts ? fmt.int(counts.alerte ?? 0) : '–'} label="en alerte" ton={TONS_SECHERESSE[2]} />
          <Kpi value={depts ? fmt.int(counts.vigilance ?? 0) : '–'} label="en vigilance" ton={TONS_SECHERESSE[1]} sub={depts ? `${fmt.int(counts.pas_de_restriction ?? 0)} sans restriction` : 'chargement…'} />
        </div>
      )}
      <div className="grid cols-map">
        <div>
          <VigiEauMap ressource={ressource} height={560} onHover={(p) => setSurvol(p ? String(p.code) : null)} selected={survol} />
        </div>
        <div className="card">
          <h3>Départements en alerte ou plus{depts ? ` (${ranking.length})` : ''}</h3>
          {/* Liste groupée par niveau, dans une boîte de la hauteur de la carte : les quelque 80 départements
              en crise d'un été sec étiraient la page et laissaient un grand vide sous la carte (revue du
              2026-09-22). */}
          <div className="table-scroll haut" style={{ maxHeight: 560 }}>
            <table className="data">
              <caption className="sr-only">Départements classés par niveau de restriction décroissant</caption>
              <tbody>
                {NIVEAUX.filter((niv) => niv.ordre >= 2)
                  .sort((a, b) => b.ordre - a.ordre)
                  .map((niv) => {
                    const lignes = ranking.filter((x) => x.n?.key === niv.key)
                    if (!lignes.length) return null
                    return [
                      <tr key={niv.key} className="groupe">
                        <th colSpan={2}>
                          {niv.label} · {lignes.length}
                        </th>
                      </tr>,
                      ...lignes.map(({ d }) => (
                        <tr key={d.code} className={survol === d.code ? 'on' : undefined} onMouseEnter={() => setSurvol(d.code)} onMouseLeave={() => setSurvol(null)}>
                          <td>
                            <Link to={`/departement/${d.code}`}>{d.nom}</Link> <span className="muted">({d.code})</span>
                          </td>
                          <td className="num">
                            {/* Le niveau n'apparaît en clair que dans l'en-tête du groupe, plusieurs lignes au-dessus :
                                un lecteur d'écran qui parcourt les cellules une à une n'aurait que la pastille,
                                aria-hidden (audit du 2026-09-22). */}
                            <span className="swatch" style={{ background: couleurNiveau(niv.key) }} aria-hidden="true" />
                            <span className="sr-only">{niv.label}</span>
                          </td>
                        </tr>
                      )),
                    ]
                  })}
              </tbody>
            </table>
          </div>
          {depts && !ranking.length && <p className="muted">Aucun département en alerte aujourd'hui.</p>}
        </div>
      </div>
      <SecheresseHistorique />
      <div className="source">
        Source : VigiEau, ministère de la Transition écologique, API publique interrogée par votre navigateur. La fiche de chaque commune affiche le détail des
        zones et arrêtés qui la concernent.
      </div>
    </div>
  )
}

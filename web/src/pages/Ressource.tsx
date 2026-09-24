import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { useDensite } from '../lib/densite'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { INDICS_RESSOURCE, fmtRessource, valeurRessource } from '../lib/ressource'
import { divergingScale, stepScale } from '../lib/scale'
import { usePageTitle } from '../lib/title'
import type { RessourceFile } from '../lib/types'
import Kpi from '../components/Kpi'

/**
 * Pression sur la ressource en eau potable, par département : indicateurs montrés un par un, sans score composite.
 * Ce n'est pas un bilan face aux volumes autorisés (arrêtés de DUP), non publiés en données ouvertes.
 */
export default function Ressource() {
  usePageTitle(
    'Pression sur la ressource',
    "Prélèvements d'eau potable, zones de déficit, fuites, consommation, protection des captages, nappes et restrictions, département par département.",
  )
  const r = useJson<RessourceFile>('ressource/national.json').data
  const [densite] = useDensite()
  const { deps, names } = useDepartements()
  const [sp, setSp] = useSearchParams()
  const ind = INDICS_RESSOURCE.find((i) => i.key === sp.get('indic')) ?? INDICS_RESSOURCE[0]
  const setIndic = (k: string) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS_RESSOURCE[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
  const nav = useNavigate()
  // Tri du tableau complet : colonne et sens, au clic sur l'en-tête (revue du 2026-09-22).
  const [tri, setTri] = useState<{ cle: string; desc: boolean }>({ cle: 'nom', desc: false })
  const val = useCallback((dd: string) => valeurRessource(r?.depts[dd], ind.key), [r, ind])

  const valeurs = useMemo(() => {
    const m = new Map<string, number>()
    for (const dd of Object.keys(r?.depts ?? {})) {
      const v = val(dd)
      if (v != null) m.set(dd, v)
    }
    return m
  }, [r, val])
  // Paliers ronds fixes par indicateur ; l'évolution des prélèvements, qui a un zéro, est divergente.
  const scale = useMemo(
    () => (ind.divergent ? divergingScale(ind.paliers) : stepScale(ind.paliers, { invert: ind.pire === 'bas', ouvertBas: ind.ouvertBas })),
    [ind],
  )
  const fmtV = useCallback((v: number | null) => fmtRessource(ind, v), [ind])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(val(String(p.code))), [scale, val])
  const labelOf = useCallback((p: Record<string, unknown>) => `<b>${p.nom}</b> (${p.code})<br>${fmtV(val(String(p.code)))}`, [val, fmtV])
  const classement = useMemo(
    () => [...valeurs.entries()].sort((a, b) => (ind.pire === 'bas' ? a[1] - b[1] : b[1] - a[1])),
    [valeurs, ind],
  )

  if (!r) return <Chargement />
  const n = r.national
  const annee = ind.annee(n)

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: 'Pression sur la ressource' }]} />
      <h1>Pression sur la ressource en eau potable</h1>
      <p className="lead">
        Combien on prélève pour l'eau potable, et où ; ce qui se perd en route ; si les captages sont protégés ; et si les nappes et les
        rivières sont à la peine. Chaque indicateur est montré pour lui-même : les additionner en un score inventerait une pondération.
      </p>
      <div className="card note">
        <b>Ce que ce bilan ne dit pas.</b> La marge entre ce qui est prélevé et ce qui est autorisé : les volumes autorisés figurent dans les
        arrêtés de déclaration d'utilité publique (DUP) des captages et dans la base des ARS, qui ne sont pas publiés en données ouvertes.
        Un département peut donc prélever sans dépasser ses autorisations et rester sous forte pression, ou l'inverse.
      </div>

      <div className="grid cols-4">
        <Kpi value={`${fmt.dec((n.prel_m3 ?? 0) / 1e9, 2)} Md m³`} label={`prélevés pour l'eau potable en ${n.annee_bnpe}`} sub={n.prel_evol == null ? '' : `${n.prel_evol > 0 ? '+' : ''}${fmt.dec(n.prel_evol, 1)} % en cinq ans (moyennes de trois ans)`} />
        <Kpi value={fmt.pct(n.part_zre, 0)} label="dans une zone de répartition des eaux" sub="déficit structurel reconnu entre ressource et besoins" />
        <Kpi value={fmt.pct(n.pertes_pct, 0)} label={`de l'eau mise en distribution perdue en fuites (${n.annee_sispea})`} sub={`${fmt.int(n.conso_l_hab_j)} L par habitant et par jour à domicile`} />
        <Kpi value={fmt.pct(n.protection_moy, 0)} label="d'avancement de la protection des captages" sub="moyenne des services (indicateur SISPEA P108.3)" />
      </div>

      <div className="toolbar">
        <h2>Par département</h2>
        <label>
          Indicateur{' '}
          <select value={ind.key} onChange={(e) => setIndic(e.target.value)}>
            {INDICS_RESSOURCE.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            onClick={(p) => nav(`/departement/${p.code}`)}
            actionLabel="Ouvrir la fiche du département →"
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={540}
            ariaLabel={`${ind.label}, par département, ${annee}`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit}, ${annee})`} scale={scale} format={(v) => fmtRessource(ind, v, false)} />
        </div>
        <div className="card">
          <h3>{ind.pire === 'bas' ? 'Les plus faibles' : ind.pire === 'haut' ? 'Les plus élevés' : 'Du plus haut au plus bas'}</h3>
          <div className="table-scroll"><table className="data">
            <caption className="sr-only">Départements classés selon « {ind.label} » ; version textuelle de la carte</caption>
            <tbody>
              {classement.slice(0, 14).map(([dd, v]) => (
                <tr key={dd} className={survol === dd ? 'on' : undefined} onMouseEnter={() => setSurvol(dd)} onMouseLeave={() => setSurvol(null)}>
                  <td>
                    <Link to={`/departement/${dd}`}>{names.get(dd) ?? dd}</Link> <span className="muted">({dd})</span>
                  </td>
                  <td className="num">
                    <b>{fmtV(v)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted">France : {fmtV(valeurRessource(n, ind.key))}</p>
        </div>
      </div>

      {/* Le tableau le plus lourd du site (101 lignes × 9 indicateurs) : replié par défaut (audit du
          2026-09-22). La carte et le classement ci-dessus répondent déjà à « quel département », ce tableau
          sert à comparer un département précis sur tous les indicateurs à la fois. */}
      <Section key={`tous-les-indicateurs-${densite}`} id="tous-les-indicateurs" titre="Tous les indicateurs, département par département" resume="Le tableau complet, triable, pour comparer un département sur les neuf indicateurs à la fois" ouvert={densite === 'detaille'}>
      <div className="card">
        <p className="muted">Cliquer sur un en-tête pour trier ; le libellé complet et l'année s'affichent au survol.</p>
        <div className="table-scroll haut">
          <table className="data">
            <thead>
              <tr>
                {[{ key: 'nom', court: 'Département', unit: '', label: 'Département' }, ...INDICS_RESSOURCE].map((i) => {
                  const actif = tri.cle === i.key
                  return (
                    <th
                      key={i.key}
                      className={i.key === 'nom' ? 'fige' : 'num wrap'}
                      title={'annee' in i ? `${i.label} (${i.annee(n)})` : undefined}
                      aria-sort={actif ? (tri.desc ? 'descending' : 'ascending') : 'none'}
                    >
                      <button type="button" className="tri" onClick={() => setTri({ cle: i.key, desc: actif ? !tri.desc : i.key !== 'nom' })}>
                        {i.court}
                        {actif ? (tri.desc ? ' ▼' : ' ▲') : ''}
                      </button>
                      {i.unit && i.unit !== i.court && <span className="unite">{i.unit}</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="fige">
                  <b>France</b>
                </td>
                {INDICS_RESSOURCE.map((i) => (
                  <td key={i.key} className="num">
                    <b>{fmtRessource(i, valeurRessource(n, i.key), false)}</b>
                  </td>
                ))}
              </tr>
              {Object.keys(r.depts)
                .sort((a, b) => {
                  if (tri.cle === 'nom') return (tri.desc ? -1 : 1) * (names.get(a) ?? a).localeCompare(names.get(b) ?? b)
                  const k = tri.cle as (typeof INDICS_RESSOURCE)[number]['key']
                  const va = valeurRessource(r.depts[a], k)
                  const vb = valeurRessource(r.depts[b], k)
                  // Sans valeur : toujours en fin de liste, quel que soit le sens.
                  if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1
                  return tri.desc ? vb - va : va - vb
                })
                .map((dd) => (
                  <tr key={dd} className={survol === dd ? 'on' : undefined}>
                    <td className="fige">
                      <Link to={`/departement/${dd}`}>{names.get(dd) ?? dd}</Link>
                    </td>
                    {INDICS_RESSOURCE.map((i) => {
                      const v = valeurRessource(r.depts[dd], i.key)
                      return (
                        <td key={i.key} className="num">
                          {v == null ? <span className="muted">–</span> : fmtRessource(i, v, false)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      </Section>

      <div className="source">
        Sources : BNPE (volumes prélevés pour l'eau potable, OFB, {n.annee_bnpe}) ; zones de répartition des eaux (Sandre) : {n.n_zre} zones,
        un ouvrage compte s'il est dans une zone du même type de ressource (nappe ou cours d'eau), hors zones ne visant qu'une nappe profonde
        ({n.zre_exclues.length} zones : {n.zre_exclues.slice(0, 3).join(', ')}…) ; évolution des prélèvements entre les moyennes
        {n.annee_bnpe_ref - 2}-{n.annee_bnpe_ref} et {n.annee_bnpe - 2}-{n.annee_bnpe}, publiée seulement si le nombre d'ouvrages déclarants a
        varié de moins de 15 % (sinon « – ») ; SISPEA {n.annee_sispea} (volumes déclarés par les services qui
        distribuent l'eau, indicateur P108.3) ; piézométrie Hub'Eau ; arrêtés sécheresse. La consommation par habitant rapporte les volumes aux
        seuls résidents : elle est gonflée là où le tourisme est fort. <Link to="/methode">Méthode</Link>.
      </div>
    </div>
  )
}

import TableauDeptsValeur from '../components/TableauDeptsValeur'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import { lienDepartement } from '../lib/parcours'
import IndicInconnu from '../components/IndicInconnu'
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
  const indicInconnu = !!sp.get('indic') && !INDICS_RESSOURCE.some((i) => i.key === sp.get('indic'))
  const setIndic = (k: string) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS_RESSOURCE[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
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
    () => (ind.divergent ? divergingScale(ind.paliers) : stepScale(ind.paliers, { invert: ind.pire === 'bas', ouvertBas: ind.ouvertBas, rampe: ind.rampe })),
    [ind],
  )
  const fmtV = useCallback((v: number | null) => fmtRessource(ind, v), [ind])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(val(String(p.code))), [scale, val])
  const labelOf = useCallback((p: Record<string, unknown>) => `<b>${p.nom}</b> (${p.code})<br>${fmtV(val(String(p.code)))}`, [val, fmtV])
  const classement = useMemo(
    () => [...valeurs.entries()].sort((a, b) => (ind.pire === 'bas' ? a[1] - b[1] : b[1] - a[1])),
    [valeurs, ind],
  )

  if (!r) return <Chargement reserve />
  const n = r.national
  const annee = ind.annee(n)

  return (
    <div className="page">
      <p className="eyebrow">La ressource</p>
      <Crumbs items={[{ label: 'La ressource', to: '/ressource-en-eau' }, { label: 'Pression sur la ressource' }]} />
      <h1>Pression sur la ressource en eau potable</h1>
      <p className="lead">
        Cette page présente, département par département, les volumes prélevés pour l'eau potable et leur localisation, les pertes en
        distribution, l'avancement de la protection des captages, l'état des nappes et les restrictions d'usage liées à la sécheresse. Chaque
        indicateur est présenté séparément, car leur agrégation en un score unique supposerait une pondération arbitraire.
      </p>
      <div className="card note">
        <b>Limites de ce bilan.</b> Les volumes prélevés ne sont pas comparés aux volumes autorisés. Ces derniers figurent dans les arrêtés de
        déclaration d'utilité publique (DUP) des captages et dans la base des ARS, qui ne sont pas publiés en données ouvertes. Un département
        peut donc respecter ses autorisations tout en subissant une forte pression sur la ressource, et inversement.
      </div>

      <div className="grid cols-4">
        <Kpi value={`${fmt.dec((n.prel_m3 ?? 0) / 1e9, 2)} Md m³`} label={`prélevés pour l'eau potable en ${n.annee_bnpe}`} sub={n.prel_evol == null ? '' : `${n.prel_evol > 0 ? '+' : ''}${fmt.dec(n.prel_evol, 1)} % en cinq ans (moyennes de trois ans)`} />
        <Kpi value={fmt.pct(n.part_zre, 0)} label="des prélèvements d'eau potable faits en zone de répartition des eaux" sub="zones où la ressource manque de façon chronique face aux besoins" />
        <Kpi value={fmt.pct(n.pertes_pct, 1)} label={`de l'eau mise en distribution perdue en fuites (${n.annee_sispea})`} sub={`${fmt.int(n.conso_l_hab_j)} L par habitant et par jour à domicile`} />
        <Kpi
          value={fmt.pct(n.protection_moy, 0)}
          label="d'avancement des procédures de protection des captages"
          sub="de 0 % (aucune procédure engagée) à 100 % (protection mise en place et suivie) ; moyenne des services, indicateur SISPEA P108.3"
        />
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
        {indicInconnu && <IndicInconnu affiche={ind.label} />}
      </div>
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: 'pressions' }) })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={540}
            ariaLabel={`${ind.label}, par département, ${annee}`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit}, ${annee})`} scale={scale} format={(v) => fmtRessource(ind, v, false)} />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">Par ordre alphabétique ; un tri est proposé. France : {fmtV(valeurRessource(n, ind.key))}.</p>
          <TableauDeptsValeur
            valeurs={new Map(classement)}
            noms={names}
            titre={ind.unit}
            format={fmtV}
            quoi={ind.label.toLowerCase()}
            lien={(dd) => lienDepartement(dd, { section: 'pressions' })}
            legende={`Départements par ordre alphabétique : ${ind.label} ; version textuelle de la carte`}
            csv={{ sujet: `ressource-${ind.key}`, annee, entete: `${ind.label} (${ind.unit})` }}
            selection={survol}
            onSurvol={setSurvol}
          />
        </div>
      </div>

      {/* Le tableau le plus lourd du site (101 lignes × 9 indicateurs) : replié par défaut (audit du
          2026-09-22). La carte et le classement ci-dessus répondent déjà à « quel département », ce tableau
          sert à comparer un département précis sur tous les indicateurs à la fois. */}
      <Section key={`tous-les-indicateurs-${densite}`} id="tous-les-indicateurs" titre="Tous les indicateurs, département par département" resume="Le tableau complet, triable, pour comparer un département sur tous les indicateurs à la fois" ouvert={densite === 'detaille'}>
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
                      <Link to={lienDepartement(dd, { section: 'pressions' })}>{names.get(dd) ?? dd}</Link>
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
        Sources : BNPE (volumes prélevés pour l'eau potable, OFB, {n.annee_bnpe}) ; zones de répartition des eaux (Sandre, {n.n_zre} zones) ;
        SISPEA {n.annee_sispea} (volumes déclarés par les services qui distribuent l'eau, indicateur P108.3) ; piézométrie Hub'Eau ; arrêtés
        sécheresse. Un ouvrage est compté en zone de répartition s'il se trouve dans une zone du même type de ressource (nappe ou cours d'eau) ;
        les {n.zre_exclues.length} zones qui ne visent qu'une nappe profonde sont exclues ({n.zre_exclues.slice(0, 3).join(', ')}…). L'évolution
        des prélèvements compare les moyennes {n.annee_bnpe_ref - 2}-{n.annee_bnpe_ref} et {n.annee_bnpe - 2}-{n.annee_bnpe} ; elle n'est publiée
        que si le nombre d'ouvrages déclarants a varié de moins de 15 % et elle est remplacée par « – » dans le cas contraire. La consommation par
        habitant rapporte les volumes aux seuls résidents ; elle est donc surestimée dans les départements très touristiques.{' '}
        <Link to="/methode#ressource">Méthode</Link>.
      </div>
    </div>
  )
}

import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import type { FeatureCollection } from 'geojson'
import Chart, { axisDefaults, lineDefaults } from '../components/Chart'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { stepScale } from '../lib/scale'
import MapLegend from '../components/MapLegend'
import Search from '../components/Search'
import Section from '../components/Section'
import type { MetaFile, SispeaDeptYear, SispeaNationalFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { useYear } from '../lib/year'
import { serieMedianes } from '../lib/sispea'
import Kpi from '../components/Kpi'

type IndicKey = 'prix' | 'rend' | 'renouv' | 'delegation'
/**
 * `higherIsWorse` oriente la couleur et le sens du classement ; `null` pour un indicateur descriptif (le mode
 * de gestion n'est ni bon ni mauvais en soi) : classement du plus haut au plus bas, sans vocabulaire de jugement.
 */
/**
 * `paliers` : bornes rondes fixes, les mêmes pour tous les millésimes (décision de l'auteur, 2026-09-22),
 * calées sur la distribution départementale 2019-2024 (prix 1,9–3,1 €/m³ entre les 5e et 95e centiles,
 * rendement 69–90 %, renouvellement 0–0,9 %/an, délégation 8–93 %). `dec` : décimales affichées.
 */
const INDICS: {
  key: IndicKey
  label: string
  unit: string
  get: (d: SispeaDeptYear) => number | null
  higherIsWorse: boolean | null
  haut: string
  bas: string
  paliers: number[]
  ouvertBas?: boolean
  dec: number
}[] = [
  { key: 'prix', label: 'Prix moyen du m³ (pondéré par la population)', unit: '€/m³', get: (d) => d.prix.pond, higherIsWorse: true, haut: 'les plus chers', bas: 'les moins chers', paliers: [0, 2, 2.25, 2.5, 2.75, 3, 3.25], ouvertBas: true, dec: 2 },
  { key: 'rend', label: 'Rendement du réseau (pondéré)', unit: '%', get: (d) => d.rend.pond, higherIsWorse: false, haut: 'les rendements les plus faibles', bas: 'les rendements les plus élevés', paliers: [0, 70, 75, 80, 85, 90], ouvertBas: true, dec: 1 },
  { key: 'renouv', label: 'Renouvellement annuel des canalisations (médiane)', unit: '%/an', get: (d) => d.renouv.p50, higherIsWorse: false, haut: 'les renouvellements les plus lents', bas: 'les renouvellements les plus rapides', paliers: [0, 0.2, 0.4, 0.6, 0.8, 1], dec: 2 },
  { key: 'delegation', label: 'Part de la population en délégation privée', unit: '%', get: (d) => (d.part_pop_delegation == null ? null : 100 * d.part_pop_delegation), higherIsWorse: null, haut: 'les parts les plus élevées', bas: 'les parts les plus faibles', paliers: [0, 20, 40, 60, 80], dec: 0 },
]

export default function Services() {
  const cle = useCleTheme()
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const deps = useJson<FeatureCollection>('geo/departements.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const [shared] = useYear(meta)
  const [densite] = useDensite()
  const complete = useMemo(() => (nat ? Object.keys(nat.annees).filter((y) => nat.annees[y].prix.n >= 3000).sort() : []), [nat])
  // Millésime propre à cette page (clé « sispea », distincte du millésime partagé « annee ») : les années
  // SISPEA complètes (2020-2022 aujourd'hui) ne font pas toutes partie de meta.annees, le millésime partagé
  // les rejetterait et écraserait au passage le choix valide de tout le reste du site en sessionStorage.
  const [sp, setSp] = useSearchParams()
  const sispeaUrl = sp.get('sispea')
  const y =
    sispeaUrl && complete.includes(sispeaUrl)
      ? sispeaUrl
      : shared && complete.includes(String(shared))
        ? String(shared)
        : complete[complete.length - 1]
  const setYear = (v: string) => {
    const next = new URLSearchParams(sp)
    next.set('sispea', v)
    setSp(next)
  }
  const ny = nat && y ? nat.annees[y] : undefined
  // Indicateur de la carte dans l'URL (?indic=), comme sur la carte principale ; « prix » par défaut.
  const ind = INDICS.find((i) => i.key === sp.get('indic')) ?? INDICS[0]
  const setIndic = (k: IndicKey) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
  const nav = useNavigate()

  const deptVal = useMemo(() => {
    const m = new Map<string, number>()
    if (!nat || !y) return m
    for (const [d, byYear] of Object.entries(nat.depts)) {
      const v = byYear[y] ? ind.get(byYear[y]) : null
      if (v != null) m.set(d, v)
    }
    return m
  }, [nat, y, ind])
  // Mode de gestion : rampe neutre d'une seule teinte, il n'est ni bon ni mauvais en soi.
  const echelle = useMemo(() => stepScale(ind.paliers, { invert: ind.higherIsWorse === false, ouvertBas: ind.ouvertBas }), [ind, cle])
  const colorOf = useCallback((p: Record<string, unknown>) => echelle.color(deptVal.get(String(p.code)) ?? null), [deptVal, echelle])
  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = deptVal.get(String(p.code))
      return `<b>${p.nom}</b> (${p.code})<br>${v == null ? 'pas de donnée' : `${fmt.dec(v, ind.dec)} ${ind.unit}`}`
    },
    [deptVal, ind],
  )

  const serieOption = useMemo(() => {
    if (!nat) return null
    const p = chartPalette()
    const { years, prix, rend } = serieMedianes(nat)
    return {
      grid: [{ left: 50, right: 20, top: 46, height: 110 }, { left: 50, right: 20, top: 206, height: 110 }],
      axisPointer: { link: [{ xAxisIndex: 'all' as const }] },
      tooltip: { trigger: 'axis' as const },
      legend: { top: 0, type: 'scroll' as const, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: [
        { type: 'category' as const, data: years, gridIndex: 0, ...axisDefaults(), axisLabel: { show: false } },
        { type: 'category' as const, data: years, gridIndex: 1, ...axisDefaults() },
      ],
      yAxis: [
        { type: 'value' as const, gridIndex: 0, name: '€/m³', scale: true, ...axisDefaults() },
        { type: 'value' as const, gridIndex: 1, name: '% rendement', scale: true, ...axisDefaults() },
      ],
      series: [
        { type: 'line' as const, name: 'Prix médian du m³', data: prix, xAxisIndex: 0, yAxisIndex: 0, ...lineDefaults(p.series[0]) },
        { type: 'line' as const, name: 'Rendement médian', data: rend, xAxisIndex: 1, yAxisIndex: 1, ...lineDefaults(p.series[2]) },
      ],
    }
  }, [nat, cle])

  if (!nat || !ny || !y) return <Chargement />
  const fuite = ny.rend.pond != null ? 100 - ny.rend.pond : null
  const g = nat.gestion[y] ?? {}
  const popTot = (g.regie?.pop ?? 0) + (g.delegation?.pop ?? 0)
  const ranking = [...deptVal.entries()].sort((a, b) => (ind.higherIsWorse === false ? a[1] - b[1] : b[1] - a[1]))

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: "Services d'eau" }]} />
      <h1>Les services d'eau : prix, fuites, renouvellement</h1>
      {/* La recherche ne dépend d'aucune année : au-dessus de la barre (règle d'ordre de l'auteur, 23/09). La
          recherche unique remplace l'ancienne recherche de collectivités (plan, étape 17). */}
      <div className="recherche-services">
        <h2>Trouver un service d’eau</h2>
        <Search label="Rechercher un service d’eau, un syndicat, une commune ou un réseau" placeholder="Syndicat, collectivité, commune…" />
      </div>
      <BarreAnnee
        titre="Année des données SISPEA"
        note="Elle vaut pour les chiffres, la carte et le classement ci-dessous ; seules les années assez déclarées sont proposées."
        annees={complete.map((a) => ({ annee: Number(a), enCours: false, sansDonnees: false }))}
        annee={Number(y)}
        onChange={(a) => setYear(String(a))}
      />
      <p className="muted">
        {fmt.int(ny.n)} services d'eau potable déclarants en {y}, desservant {fmt.int(ny.pop ?? 0)} habitants.
      </p>

      <div className="grid cols-4">
        <Kpi value={`${fmt.dec(ny.prix.pond, 2)} €`} label="le m³ d'eau potable, prix moyen pondéré" sub={`médiane ${fmt.dec(ny.prix.p50, 2)} € · de ${fmt.dec(ny.prix.p10, 2)} à ${fmt.dec(ny.prix.p90, 2)} € (10 % – 90 %)`} />
        <Kpi value={fmt.pct(fuite, 1)} label="de l'eau mise en distribution est perdue en fuites" sub={`rendement pondéré ${fmt.pct(ny.rend.pond, 1)}`} />
        <Kpi value={`${fmt.int(ny.renouv.p50 ? 100 / ny.renouv.p50 : null)} ans`} label="pour renouveler tout le réseau au rythme médian" sub={`${fmt.dec(ny.renouv.p50, 2)} % renouvelés par an`} />
        <Kpi value={fmt.pct(popTot ? (100 * (g.delegation?.pop ?? 0)) / popTot : null, 0)} label="des habitants sont servis par une délégation privée" sub={`${fmt.int(g.delegation?.n ?? 0)} services délégués, ${fmt.int(g.regie?.n ?? 0)} régies`} />
      </div>

      {/* Détail replié (audit du 2026-09-22) : les quatre KPI et la recherche répondent déjà à l'essentiel. */}
      <Section key={`historique-${densite}`} id="historique" titre="Prix, rendement et mode de gestion" resume="Évolution depuis 2008, et comparaison régie / délégation" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Prix et rendement médians</h2>
          {serieOption && <Chart option={serieOption} height={346} exportName="prix-rendement-medians" />}
          <div className="source">Médianes des services déclarants, tracées seulement sur un millésime d'au moins 3 000 déclarants : les trous sont des années trop peu déclarées ou absentes des sources. 2008-2019 : API Hub'Eau ; 2020 et suivants : extractions annuelles de l'observatoire.</div>
        </div>
        <div className="card">
          <h2>Régie publique ou délégation privée ({y})</h2>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Mode de gestion</th>
                <th className="num">Services</th>
                <th className="num">Habitants</th>
                <th className="num wrap">
                  Prix médian <span className="unite">€/m³</span>
                </th>
                <th className="num wrap">
                  Prix pondéré <span className="unite">€/m³</span>
                </th>
                <th className="num wrap">
                  Rendement <span className="unite">%</span>
                </th>
                <th className="num wrap">
                  Renouvellement <span className="unite">%/an</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(['regie', 'delegation'] as const).map((k) => {
                const v = g[k]
                if (!v) return null
                return (
                  <tr key={k}>
                    <td>
                      {/* Badge neutre : vert / orange suggérait un jugement que la page s'interdit. */}
                      <span className="badge neutre">{k === 'regie' ? 'Régie' : 'Délégation'}</span>
                    </td>
                    <td className="num">{fmt.int(v.n)}</td>
                    <td className="num">{fmt.int(v.pop ?? 0)}</td>
                    <td className="num">{fmt.dec(v.prix.p50, 2)}</td>
                    <td className="num">{fmt.dec(v.prix.pond, 2)}</td>
                    <td className="num">{fmt.dec(v.rend.pond, 1)}</td>
                    <td className="num">{fmt.dec(v.renouv.p50, 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <p className="muted">
            Les délégations concernent surtout les grandes agglomérations, les régies les petites communes : la comparaison brute mélange taille et mode de gestion.
          </p>
        </div>
      </div>
      </Section>

      <div className="toolbar">
        <h2>Par département</h2>
        <label>
          Indicateur{' '}
          <select value={ind.key} onChange={(e) => setIndic(e.target.value as IndicKey)}>
            {INDICS.map((i) => (
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
            height={560}
            ariaLabel={`${ind.label} par département, ${y}`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit}), ${y}`} scale={echelle} format={(v) => fmt.dec(v, ind.dec === 0 ? 0 : ind.key === 'prix' || ind.key === 'renouv' ? ind.dec : 0)} />
        </div>
        <div className="card">
          <h3>Classement · {ind.unit}</h3>
          <div className="table-scroll"><table className="data">
            <caption className="sr-only">Départements classés selon « {ind.label} » en {y} ; version textuelle de la carte</caption>
            <tbody>
              {(
                [
                  [ind.haut, ranking.slice(0, 8)],
                  [ind.bas, ranking.slice(-6).reverse()],
                ] as const
              ).map(([titre, rows]) => [
                <tr key={titre}>
                  <th colSpan={2} className="muted">
                    {titre}
                  </th>
                </tr>,
                ...rows.map(([d, v]) => (
                  <tr key={titre + d} className={survol === d ? 'on' : undefined} onMouseEnter={() => setSurvol(d)} onMouseLeave={() => setSurvol(null)}>
                    <td>
                      <Link to={`/departement/${d}`}>{deptName.get(d) ?? d}</Link> <span className="muted">({d})</span>
                    </td>
                    <td className="num">
                      <b>{fmt.dec(v, ind.dec)}</b>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="source">Source : observatoire des services publics d'eau et d'assainissement (SISPEA, Office français de la biodiversité). Indicateurs déclarés par les collectivités ; prix D102.0 pour 120 m³, rendement P104.3, renouvellement P107.2.</div>
    </div>
  )
}

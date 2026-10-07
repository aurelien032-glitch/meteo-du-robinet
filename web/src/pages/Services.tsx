import TableauDeptsValeur from '../components/TableauDeptsValeur'
import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { useSearchParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chart, { axisDefaults, lineDefaults } from '../components/Chart'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { stepScale } from '../lib/scale'
import MapLegend from '../components/MapLegend'
import Search from '../components/Search'
import Section from '../components/Section'
import type { MetaFile, SispeaNationalFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { usePageTitle } from '../lib/title'
import { useYear } from '../lib/year'
import IndicInconnu from '../components/IndicInconnu'
import { lienCommunesCarte, lienDepartement } from '../lib/parcours'
import { INDICS_DEPT } from '../lib/indicateursDept'
import { anneesSispea, INDICS_SISPEA as INDICS, serieMedianes, type IndicSispea } from '../lib/sispea'
import Kpi from '../components/Kpi'

export default function Services() {
  // Titre et description de la page statique (scripts/routes-statiques.mjs) : arrivée par un lien interne, la page
  // gardait le titre générique (vérification du 24/09).
  usePageTitle(
    "Les services d'eau : prix, fuites, renouvellement",
    "Prix de l'eau, rendement des réseaux, renouvellement des canalisations et mode de gestion des services d'eau, département par département.",
  )
  const cle = useCleTheme()
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const { deps, names: deptName } = useDepartements()
  const meta = useJson<MetaFile>('meta.json').data
  const [shared] = useYear(meta)
  const [densite] = useDensite()
  const complete = useMemo(() => anneesSispea(nat), [nat])
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
  const indicInconnu = !!sp.get('indic') && !INDICS.some((i) => i.key === sp.get('indic'))
  const setIndic = (k: IndicSispea) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)

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

  if (!nat || !ny || !y) return <Chargement reserve />
  // Un seul chiffre des fuites sur tout le site (choix de l'auteur, 24/09) : celui des volumes déclarés, comme /ressource
  // et la carte, et non plus 100 moins le rendement. Le rendement, calculé autrement (exports compris), n'est plus
  // placé dessous : 100 moins lui ne retombait pas sur ce chiffre (relecture du 25/09).
  const fuite = ny.pertes_vol ?? null
  const g = nat.gestion[y] ?? {}
  const popTot = (g.regie?.pop ?? 0) + (g.delegation?.pop ?? 0)

  return (
    <div className="page">
      <p className="eyebrow">La ressource</p>
      <Crumbs items={[{ label: 'La ressource', to: '/ressource-en-eau' }, { label: "Services d'eau" }]} />
      <h1>Les services d'eau : prix, fuites, renouvellement</h1>
      {/* SISPEA, sigle de toute la page, défini à sa première apparition (choix de l'auteur, 24/09). */}
      <p className="lead">
        Cette page présente les indicateurs que chaque service d’eau déclare à SISPEA, l’observatoire national des services d’eau et
        d’assainissement (Office français de la biodiversité) : prix, rendement du réseau, renouvellement des canalisations et mode de gestion.
      </p>
      {/* La recherche ne dépend d'aucune année : au-dessus de la barre (règle d'ordre de l'auteur, 23/09). La
          recherche unique remplace l'ancienne recherche de collectivités (plan, étape 17). */}
      <div className="recherche-services">
        <h2>Trouver un service d’eau</h2>
        <Search label="Rechercher un service d’eau, un syndicat, une commune ou un réseau" placeholder="Syndicat, collectivité, commune…" />
      </div>
      <BarreAnnee
        titre="Année des données SISPEA"
        note="Elle vaut pour les chiffres, la carte et le classement ci-dessous. Seules sont proposées les années pour lesquelles au moins 3 000 services ont déclaré leur prix."
        annees={complete.map((a) => ({ annee: Number(a), enCours: false, sansDonnees: false }))}
        annee={Number(y)}
        onChange={(a) => setYear(String(a))}
        param="sispea"
      />
      <p className="muted">
        {/* Le total dépasse la population française sans que rien ne l'explique (vérification du 24/09). */}
        En {y}, {fmt.int(ny.n)} services d'eau potable ont transmis une déclaration ; ils desservent au total {fmt.int(ny.pop ?? 0)} habitants.
        Ce total dépasse la population française, car un même habitant peut relever de plusieurs services (production, transport, distribution).
      </p>

      <div className="grid cols-4">
        <Kpi value={`${fmt.dec(ny.prix.pond, 2)} €`} label="le m³ d'eau potable, prix moyen pondéré" sub={`médiane ${fmt.dec(ny.prix.p50, 2)} € · de ${fmt.dec(ny.prix.p10, 2)} à ${fmt.dec(ny.prix.p90, 2)} € (10 % – 90 %)`} />
        <Kpi value={fmt.pct(fuite, 1)} label="de l'eau mise en distribution est perdue en fuites" sub="volumes déclarés : eau mise en distribution moins eau consommée" />
        <Kpi value={`${fmt.int(ny.renouv.p50 ? 100 / ny.renouv.p50 : null)} ans`} label="pour renouveler tout le réseau au rythme médian" sub={`${fmt.dec(ny.renouv.p50, 2)} % renouvelés par an`} />
        <Kpi value={fmt.pct(popTot ? (100 * (g.delegation?.pop ?? 0)) / popTot : null, 0)} label="des habitants relèvent d'un service en gestion déléguée" sub={`${fmt.int(g.delegation?.n ?? 0)} services délégués, ${fmt.int(g.regie?.n ?? 0)} régies`} />
      </div>

      {/* Détail replié (audit du 2026-09-22) : les quatre KPI et la recherche répondent déjà à l'essentiel. */}
      <Section key={`historique-${densite}`} id="historique" titre="Prix, rendement et mode de gestion" resume="Évolution depuis 2008, et comparaison régie / gestion déléguée" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Prix et rendement médians</h2>
          {serieOption && <Chart option={serieOption} height={346} exportName="prix-rendement-medians" />}
          <div className="source">Médianes des services déclarants, tracées uniquement pour les années qui comptent au moins 3 000 déclarants. Les interruptions des courbes correspondent aux années insuffisamment déclarées ou absentes des sources. Données issues de l'API Hub'Eau de 2008 à 2019 et des extractions annuelles de l'observatoire à partir de 2020.</div>
        </div>
        <div className="card">
          {/* « Délégation privée » était faux pour une société publique locale (relecture du 24/09) : les deux modes définis. */}
          <h2>Régie ou gestion déléguée ({y})</h2>
          <p className="muted">
            En régie, la collectivité gère elle-même son service d’eau ; en gestion déléguée, elle le confie par contrat à une entreprise ou à une société
            publique locale.
          </p>
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
                      <span className="badge neutre">{k === 'regie' ? 'Régie' : 'Gestion déléguée'}</span>
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
            La gestion déléguée concerne surtout les grandes agglomérations, et la régie surtout les petites communes. La comparaison brute des deux modes reflète donc aussi la taille des services.
          </p>
        </div>
      </div>
      </Section>

      <div className="toolbar">
        <h2>Par département</h2>
        <label>
          Indicateur{' '}
          <select value={ind.key} onChange={(e) => setIndic(e.target.value as IndicSispea)}>
            {INDICS.map((i) => (
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
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: 'services' }), communes: INDICS_DEPT.find((i) => i.key === ind.key)?.commune ? lienCommunesCarte(dd, ind.key, { sispea: y }) : undefined })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={560}
            ariaLabel={`${ind.label} par département, ${y}`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit}), ${y}`} scale={echelle} format={(v) => fmt.dec(v, ind.dec === 0 ? 0 : ind.key === 'prix' || ind.key === 'renouv' ? ind.dec : 0)} />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">Par ordre alphabétique ; un tri est proposé.</p>
          <TableauDeptsValeur
            valeurs={deptVal}
            noms={deptName}
            titre={ind.unit}
            format={(v) => fmt.dec(v, ind.dec)}
            quoi={ind.label.toLowerCase()}
            lien={(d) => lienDepartement(d, { section: 'services' })}
            legende={`Départements par ordre alphabétique : ${ind.label} (${ind.unit}) en ${y} ; version textuelle de la carte`}
            csv={{ sujet: `services-${ind.key}`, annee: y, entete: `${ind.label} (${ind.unit})` }}
            selection={survol}
            onSurvol={setSurvol}
          />
        </div>
      </div>
      <div className="source">Source : observatoire des services publics d'eau et d'assainissement (SISPEA, Office français de la biodiversité). Indicateurs déclarés par les collectivités ; prix D102.0 pour 120 m³, rendement P104.3, renouvellement P107.2.</div>
    </div>
  )
}

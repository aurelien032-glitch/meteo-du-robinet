import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chart, { axisDefaults, partielItemStyle } from '../components/Chart'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { resumeSansInformation, toneAvis } from '../lib/avis'
import { NBSP } from '../lib/instruments'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { stepScale } from '../lib/scale'
import { usePageTitle } from '../lib/title'
import { AVIS_LIBELLE, AVIS_SANS_INFORMATION, yearLabel, type AvisCat, type AvisNationalFile, type MetaFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { anneesFiche, useYear } from '../lib/year'
import Kpi from '../components/Kpi'

const CATS: AvisCat[] = ['interdiction', 'ebullition', 'sensibles']

/** Couleur d'une catégorie : gravité décroissante, jamais la seule marque (libellé toujours affiché). */
function couleur(c: AvisCat, p: ReturnType<typeof chartPalette>): string {
  return c === 'interdiction' ? p.bad : c === 'ebullition' ? p.series[4] : p.warn
}

/** Avis sanitaires de l'ARS en France : restrictions, consignes d'ébullition, eau déconseillée aux publics sensibles. */
export default function Avis() {
  const cle = useCleTheme()
  usePageTitle(
    "Avis sanitaires de l'ARS",
    "Restrictions de consommation, consignes d'ébullition et eau déconseillée aux nourrissons et aux femmes enceintes, lues dans les conclusions du contrôle sanitaire.",
  )
  const meta = useJson<MetaFile>('meta.json').data
  const nat = useJson<AvisNationalFile>('avis/national.json').data
  const { deps, names } = useDepartements()
  const nav = useNavigate()
  const [survol, setSurvol] = useState<string | null>(null)
  const [y, setYear] = useYear(meta)
  const [densite] = useDensite()
  const ys = y != null ? String(y) : undefined
  const a = nat && ys ? nat.annees[ys] : undefined

  const causesOption = useMemo(() => {
    if (!nat || !ys) return null
    const p = chartPalette()
    const c = nat.causes[ys] ?? {}
    const tot = new Map<string, number>()
    for (const cat of CATS) for (const [k, v] of Object.entries(c[cat] ?? {})) tot.set(k, (tot.get(k) ?? 0) + v)
    const causes = [...tot.entries()].sort((x, z) => z[1] - x[1]).slice(0, 9).map(([k]) => k)
    if (!causes.length) return null
    return {
      grid: { left: 150, right: 40, top: 60, bottom: 28 },
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const }, valueFormatter: (v: unknown) => `${fmt.int(Number(v))} prélèvements` },
      legend: { top: 0, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'value' as const, ...axisDefaults() },
      yAxis: { type: 'category' as const, inverse: true, data: causes, ...axisDefaults(), axisLabel: { color: p.text, fontSize: p.fontSize } },
      series: CATS.map((cat) => ({
        type: 'bar' as const,
        name: AVIS_LIBELLE[cat],
        stack: 'avis',
        barMaxWidth: 22,
        itemStyle: { color: couleur(cat, p), borderColor: p.bg, borderWidth: 1 },
        data: causes.map((k) => c[cat]?.[k] ?? 0),
      })),
    }
  }, [nat, ys, cle])

  const evolutionOption = useMemo(() => {
    if (!nat || !meta) return null
    const p = chartPalette()
    const partiel = new Set(meta.partiel ?? [])
    const annees = meta.annees.map(String).filter((x) => nat.annees[x])
    return {
      grid: { left: 56, right: 16, top: 60, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : `${fmt.int(Number(v))} communes`) },
      legend: { top: 0, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: annees.map((x) => yearLabel(meta, x)), ...axisDefaults() },
      yAxis: { type: 'value' as const, ...axisDefaults() },
      series: CATS.map((cat) => ({
        type: 'bar' as const,
        name: AVIS_LIBELLE[cat],
        barMaxWidth: 28,
        itemStyle: { color: couleur(cat, p), borderRadius: [3, 3, 0, 0] },
        data: annees.map((x) => {
          const v = nat.annees[x]?.[cat]?.communes ?? 0
          return partiel.has(Number(x)) ? { value: v, itemStyle: partielItemStyle() } : v
        }),
      })),
    }
  }, [nat, meta, cle])

  // Carte des départements (revue du 2026-09-22 : la page n'en avait pas, alors que le sujet est
  // géographique). Un avis vise les habitants desservis : on compte les communes rattachées, comme le
  // tableau de la page, et non des réseaux.
  const parDept = useMemo(() => {
    const m = new Map<string, number>()
    for (const [d, parAn] of Object.entries(nat?.depts ?? {})) {
      const v = ys ? (parAn[ys]?.toutes ?? 0) : 0
      if (v > 0) m.set(d, v)
    }
    return m
  }, [nat, ys])
  // Départements « sans information » de l'année (pipeline, avis.sans_information) : aucune conclusion de l'ARS n'y évoque
  // de consigne, ni pour la prescrire, ni pour l'écarter. Sans avis, ils sont gris (« pas d'information »), pas « aucun avis ».
  const muets = useMemo(() => new Set(ys ? (nat?.sans_information?.[ys] ?? []) : []), [nat, ys])
  const echelle = useMemo(() => stepScale([0, 1, 5, 10, 25, 50, 100]), [cle])
  const colorOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = parDept.get(String(p.code))
      return echelle.color(v ? v : muets.has(String(p.code)) ? null : 0)
    },
    [echelle, parDept, muets],
  )
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const d = String(p.code)
      const v = parDept.get(d) ?? 0
      const r = ys ? (nat?.depts[d]?.[ys] ?? {}) : {}
      const detail = CATS.filter((c) => (r[c] ?? 0) > 0)
        .map((c) => `${fmt.int(r[c] ?? 0)} ${AVIS_LIBELLE[c]}`)
        .join('<br>')
      const etat = v
        ? `${fmt.int(v)} commune${v > 1 ? 's' : ''} concernée${v > 1 ? 's' : ''}`
        : muets.has(d) && ys
          ? `${AVIS_SANS_INFORMATION}${NBSP}: ${resumeSansInformation(ys, nat?.lecture?.[d]?.[ys]?.[0] ?? 0)}`
          : 'aucun avis'
      return `<b>${p.nom}</b><br>${etat}${detail ? `<br><span class="muted">${detail}</span>` : ''}`
    },
    [parDept, nat, ys, muets],
  )
  const nomsMuets = useMemo(() => [...muets].map((d) => names.get(d) ?? d).sort((x, z) => x.localeCompare(z, 'fr')), [muets, names])
  const muetsParAn = Object.values(nat?.sans_information ?? {}).map((l) => l.length)
  const [muetsMin, muetsMax] = [Math.min(...muetsParAn), Math.max(...muetsParAn)]

  const classement = useMemo(() => {
    if (!nat || !ys) return []
    return Object.entries(nat.depts)
      .map(([d, parAn]) => ({ d, ...(parAn[ys] ?? {}) }))
      .filter((r) => (r.toutes ?? 0) > 0)
      .sort((x, z) => (z.toutes ?? 0) - (x.toutes ?? 0) || (z.interdiction ?? 0) - (x.interdiction ?? 0))
  }, [nat, ys])

  if (!meta || !nat || !ys) return <Chargement />
  const n = (c: AvisCat) => a?.[c]?.communes ?? 0

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: "Avis sanitaires de l'ARS" }]} />
      <div className="page-head">
        <h1>Quand l'ARS restreint ou déconseille l'eau du robinet</h1>
        <Link to={`/carte?indic=avis&annee=${ys}`} className="btn">
          Voir sur la carte
        </Link>
      </div>
      <p className="lead">
        Chaque prélèvement du contrôle sanitaire se conclut par un avis de l'ARS. Au-delà de « conforme » ou « non conforme », il dit parfois
        que l'eau ne doit pas être bue, qu'elle doit être bouillie, ou qu'elle est déconseillée aux nourrissons et aux femmes enceintes.
      </p>
      {/* L'année au-dessus de ce qu'elle gouverne (règle de l'auteur, 23/09) ; l'évolution, plus bas, les montre toutes. */}
      <BarreAnnee
        titre="Année des données"
        note="Elle vaut pour les chiffres, la carte, le classement des départements et les causes ci-dessous."
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setYear}
      />

      <div className="grid cols-4">
        <Kpi value={fmt.int(n('interdiction'))} label={`communes avec une restriction de consommation en ${yearLabel(meta, ys)}`} ton={toneAvis('interdiction')} sub={`${fmt.int(a?.interdiction?.plv ?? 0)} prélèvements concernés`} />
        <Kpi value={fmt.int(n('ebullition'))} label="communes avec une consigne d'ébullition" ton={toneAvis('ebullition')} sub={`${fmt.int(a?.ebullition?.plv ?? 0)} prélèvements concernés`} />
        <Kpi value={fmt.int(n('sensibles'))} label="communes où l'eau est déconseillée aux publics sensibles" ton={toneAvis('sensibles')} sub="nourrissons, femmes enceintes, personnes fragiles" />
        <Kpi value={fmt.int(a?.local?.plv ?? 0)} label="avis limités à un bâtiment, un point d'usage ou au seul point de prélèvement" sub="plomb, chlorure de vinyle… non comptés ailleurs" />
      </div>
      {muets.size > 0 && (
        <p className="cap">
          Ces nombres ne comptent que les consignes écrites dans les conclusions de l’ARS : dans {fmt.nb(muets.size, 'département')}, aucune
          conclusion de {ys} n’en parle, ni pour en prescrire une, ni pour l’écarter (en gris sur la carte).
        </p>
      )}

      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps && nat ? deps : null}
            colorOf={colorOf}
            labelOf={labelOf}
            onClick={(p) => nav(`/departement/${p.code}`)}
            actionLabel="Ouvrir la fiche du département →"
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={520}
            ariaLabel={`Carte des départements : communes rattachées à un avis de l'ARS en ${ys}`}
          />
          <MapLegend
            desc={`communes rattachées à au moins un avis de l'ARS (${ys})`}
            scale={echelle}
            format={(v) => fmt.int(v)}
            premier="aucun avis"
            noDataLabel={AVIS_SANS_INFORMATION}
          />
        </div>
        <div className="card">
          <h2>Départements ({ys})</h2>
        {classement.length === 0 ? (
          <p className="muted">Aucun avis ce millésime.</p>
        ) : (
          <div className="table-scroll"><table className="data">
            <caption className="sr-only">Départements classés par nombre de communes rattachées à un avis de l'ARS</caption>
            <thead>
              <tr>
                <th>Département</th>
                <th className="num">Communes concernées</th>
                <th className="num">Restriction</th>
                <th className="num">Ébullition</th>
                <th className="num">Publics sensibles</th>
              </tr>
            </thead>
            <tbody>
              {classement.slice(0, 25).map((r) => (
                <tr key={r.d}>
                  <td>
                    <Link to={`/carte?indic=avis&dept=${r.d}&annee=${ys}`}>{names.get(r.d) ?? r.d}</Link> <span className="muted">({r.d})</span>
                  </td>
                  <td className="num">
                    <b>{fmt.int(r.toutes ?? 0)}</b>
                  </td>
                  <td className="num">{r.interdiction ? fmt.int(r.interdiction) : '–'}</td>
                  <td className="num">{r.ebullition ? fmt.int(r.ebullition) : '–'}</td>
                  <td className="num">{r.sensibles ? fmt.int(r.sensibles) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {nomsMuets.length > 0 && (
          <p className="muted">
            Pas d’information en {ys} ({fmt.nb(nomsMuets.length, 'département')}, aucune conclusion de l’ARS n’y évoque de consigne){NBSP}:{' '}
            {nomsMuets.join(', ')}.
          </p>
        )}
        </div>
      </div>

      {/* Détail replié (audit du 2026-09-22) : les KPI et la carte répondent déjà à « où » et « combien » ;
          causes et évolution restent un niveau plus loin. */}
      <Section key={`causes-${densite}`} id="causes" titre="Pourquoi, et depuis quand" resume="Les causes citées par l'ARS, et l'évolution du nombre de communes concernées" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Pourquoi : causes citées par l'ARS ({ys})</h2>
          {causesOption ? <Chart option={causesOption} height={340} exportName={`avis-causes-${ys}`} /> : <p className="muted">Aucun avis ce millésime.</p>}
          <div className="source">Prélèvements porteurs d'un avis, selon la cause citée dans la conclusion (une conclusion peut en citer plusieurs).</div>
        </div>
        <div className="card">
          <h2>Évolution</h2>
          {evolutionOption && <Chart option={evolutionOption} height={340} exportName="avis-evolution" />}
          <div className="source">
            Communes rattachées à au moins un avis de chaque catégorie. Le millésime en cours (barres hachurées) est incomplet.
            {muetsMax > 0 &&
              ` Départements sans information, où aucune conclusion n’évoque de consigne : ${muetsMin === muetsMax ? `${muetsMax} chaque année` : `${muetsMin} à ${muetsMax} selon l’année`} ; l’évolution se lit avec prudence.`}
          </div>
        </div>
      </div>
      </Section>

      <div className="source">
        Source : conclusions sanitaires des prélèvements, contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, ARS). Ces conclusions sont
        du texte libre ; elles sont classées automatiquement, phrase par phrase, en tenant compte des négations (« n'entraînant pas de
        mesure de restriction »), des levées de restriction, des seuils simplement rappelés et des mesures seulement envisagées. Un avis sur
        un réseau est rattaché à toutes les communes qu'il dessert, même s'il ne visait qu'un secteur. Les avis limités à un bâtiment, un
        point d'usage ou au seul point de prélèvement sont comptés à part. Là où aucune conclusion de l'année n'évoque de consigne, ni pour
        la prescrire, ni pour l'écarter, l'absence d'avis ne dit rien : le site écrit « pas d'information ». <Link to="/methode">Méthode</Link>.
      </div>
    </div>
  )
}

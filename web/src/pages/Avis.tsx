import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { lienCommunesCarte, lienDepartement } from '../lib/parcours'
import BarreAnnee from '../components/BarreAnnee'
import Chart, { axisDefaults, partielItemStyle } from '../components/Chart'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { RechercheSujet } from '../components/Sujet'
import TableauDeptsTri, { type Colonne } from '../components/TableauDeptsTri'
import { lignesAvis, type LigneAvis } from '../lib/sujets'
import { resumeSansInformation, toneAvis } from '../lib/avis'
import { NBSP } from '../lib/instruments'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { avisScale, stepScale } from '../lib/scale'
import { usePageTitle } from '../lib/title'
import { AVIS_LIBELLE, AVIS_SANS_INFORMATION, periodeAnnee, yearLabel, type AvisCat, type AvisNationalFile, type MetaFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { anneesFiche, useYear } from '../lib/year'
import Kpi from '../components/Kpi'

const CATS: AvisCat[] = ['interdiction', 'ebullition', 'sensibles']

/**
 * Couleur de chaque catégorie, celle de la carte des avis (`avisScale`, niveaux 1 à 3) : publics sensibles en orange,
 * ébullition en rouge, restriction en rouge fort. Jamais la seule marque : le libellé est toujours affiché.
 */
function couleurs(): Record<AvisCat, string> {
  const [, sensibles, ebullition, interdiction] = avisScale.steps.map((s) => s.color)
  return { sensibles, ebullition, interdiction }
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
  const [survol, setSurvol] = useState<string | null>(null)
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  const [densite] = useDensite()
  const ys = y != null ? String(y) : undefined
  const a = nat && ys ? nat.annees[ys] : undefined

  const causesOption = useMemo(() => {
    if (!nat || !ys) return null
    const p = chartPalette()
    const coul = couleurs()
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
        itemStyle: { color: coul[cat], borderColor: p.bg, borderWidth: 1 },
        data: causes.map((k) => c[cat]?.[k] ?? 0),
      })),
    }
  }, [nat, ys, cle])

  const evolutionOption = useMemo(() => {
    if (!nat || !meta) return null
    const p = chartPalette()
    const coul = couleurs()
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
        itemStyle: { color: coul[cat], borderRadius: [3, 3, 0, 0] },
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
  // de consigne, ni pour la prescrire, ni pour l'écarter. Sans avis, ils sont hachurés (« pas d'information »), pas « aucun avis ».
  const muets = useMemo(() => new Set(ys ? (nat?.sans_information?.[ys] ?? []) : []), [nat, ys])
  const echelle = useMemo(() => stepScale([0, 1, 5, 10, 25, 50, 100], { premierAucun: true, rampe: 'qualite' }), [cle])
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

  const departements = useMemo(
    () => (deps?.features ?? []).map((f) => [String(f.properties?.code), String(f.properties?.nom)] as const),
    [deps],
  )
  const lignesTableau = useMemo(() => (ys ? lignesAvis(nat, ys, departements) : []), [nat, ys, departements])
  const colonnesAvis = useMemo<Colonne<LigneAvis>[]>(() => {
    const compte = (v: number) => (v ? fmt.int(v) : '–')
    return [
      { cle: 'toutes', titre: 'Communes concernées', num: true, quoi: 'le nombre de communes concernées', valeur: (l) => l.toutes, cellule: (l) => (l.toutes == null ? <span className="muted">{AVIS_SANS_INFORMATION}</span> : <b>{fmt.int(l.toutes)}</b>) },
      { cle: 'interdiction', titre: 'Restriction', num: true, quoi: 'le nombre de communes avec une restriction', valeur: (l) => l.interdiction, cellule: (l) => compte(l.interdiction) },
      { cle: 'ebullition', titre: 'Ébullition', num: true, classe: 'col-lettre', quoi: 'le nombre de communes avec une consigne d’ébullition', valeur: (l) => l.ebullition, cellule: (l) => compte(l.ebullition) },
      { cle: 'sensibles', titre: 'Publics sensibles', num: true, classe: 'col-lettre', quoi: 'le nombre de communes où l’eau est déconseillée aux publics sensibles', valeur: (l) => l.sensibles, cellule: (l) => compte(l.sensibles) },
    ]
  }, [])

  if (!meta || !nat || !ys) return <Chargement reserve />
  const n = (c: AvisCat) => a?.[c]?.communes ?? 0
  const tonCompte = (c: AvisCat) => (n(c) > 0 ? toneAvis(c) : undefined)

  return (
    <div className="page">
      <p className="eyebrow">Sujets</p>
      <Crumbs items={[{ label: 'Sujets', to: '/themes' }, { label: 'Avis de l’ARS' }]} />
      <div className="page-head">
        <h1>Avis sanitaires de l'ARS sur l'eau du robinet</h1>
        <Link to={`/carte?indic=avis&annee=${ys}`} className="btn">
          Voir sur la carte
        </Link>
      </div>
      <p className="lead">
        Chaque prélèvement du contrôle sanitaire fait l'objet d'une conclusion de l'agence régionale de santé (ARS). Outre la conformité de l'eau,
        cette conclusion peut indiquer que l'eau ne doit pas être consommée, qu'elle doit être bouillie avant consommation ou qu'elle est déconseillée
        aux nourrissons et aux femmes enceintes. Le site désigne ces mentions sous le terme d'avis sanitaires.
      </p>
      <RechercheSujet texte="La fiche de chaque commune cite les avis de l’ARS de l’année en cours, datés, et ceux des années précédentes." />
      {/* L'année au-dessus de ce qu'elle gouverne (règle de l'auteur, 23/09) ; l'évolution, plus bas, les montre toutes. */}
      <BarreAnnee
        titre="Année du bilan"
        note="Elle vaut pour les chiffres, la carte, le tableau des départements et les causes ci-dessous."
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setYear}
      />

      <div className="grid cols-4">
        {/* Voyant de la catégorie comptée (décision de l'auteur du 24/09), jamais devant un compte nul (audit du 27/09). */}
        <Kpi value={fmt.int(n('interdiction'))} label={`communes avec une restriction de consommation ${periodeAnnee(meta, ys)}`} ton={tonCompte('interdiction')} sub={`${fmt.int(a?.interdiction?.plv ?? 0)} prélèvements concernés`} />
        <Kpi value={fmt.int(n('ebullition'))} label="communes avec une consigne d'ébullition" ton={tonCompte('ebullition')} sub={`${fmt.int(a?.ebullition?.plv ?? 0)} prélèvements concernés`} />
        <Kpi value={fmt.int(n('sensibles'))} label="communes où l'eau est déconseillée aux publics sensibles" ton={tonCompte('sensibles')} sub="nourrissons, femmes enceintes, personnes fragiles" />
        <Kpi value={fmt.int(a?.local?.plv ?? 0)} label="avis limités à un bâtiment, un point d'usage ou au seul point de prélèvement" sub="notamment plomb et chlorure de vinyle ; comptés à part" />
      </div>
      {muets.size > 0 && (
        <p className="cap">
          Ces nombres ne portent que sur les consignes écrites dans les conclusions de l’ARS. Dans {fmt.nb(muets.size, 'département')}, aucune
          conclusion de {ys} n’évoque de consigne, qu’il s’agisse de la prescrire ou de l’écarter ; ces départements sont hachurés sur la carte, avec la mention « {AVIS_SANS_INFORMATION} ».
        </p>
      )}

      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps && nat ? deps : null}
            colorOf={colorOf}
            labelOf={labelOf}
            encart={(dd) => ({ fiche: lienDepartement(dd, { indic: 'avis' }), communes: lienCommunesCarte(dd, 'avis') })}
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
          <h2>Les départements {periodeAnnee(meta, ys)}</h2>
          <p className="muted">Par ordre alphabétique ; un tri est proposé. Communes rattachées à au moins un avis de l’ARS dans l’année, par catégorie.</p>
          <TableauDeptsTri
            lignes={lignesTableau}
            colonnes={colonnesAvis}
            lien={(dd) => `/carte?indic=avis&dept=${dd}&annee=${ys}`}
            legende={`Les départements, par ordre alphabétique ou selon le tri choisi : communes rattachées à un avis de l’ARS en ${ys}, par catégorie`}
            selection={survol}
            onSurvol={setSurvol}
            csv={{
              sujet: 'avis',
              annee: ys,
              entetes: ['Code du département', 'Département', 'Année', 'Communes concernées', 'Restriction de consommation', 'Consigne d’ébullition', 'Déconseillée aux publics sensibles', 'Pas d’information'],
              ligne: (l) => [l.dd, l.nom, ys, l.toutes, l.interdiction, l.ebullition, l.sensibles, l.sansInformation ? 'oui' : 'non'],
            }}
          />
          {nomsMuets.length > 0 && (
            <p className="muted">
              Pas d’information en {ys} pour {fmt.nb(nomsMuets.length, 'département')}, où aucune conclusion de l’ARS n’évoque de
              consigne{NBSP}:{' '}{nomsMuets.join(', ')}.
            </p>
          )}
        </div>
      </div>

      {/* Détail replié (audit du 2026-09-22) : les KPI et la carte répondent déjà à « où » et « combien » ;
          causes et évolution restent un niveau plus loin. */}
      <Section key={`causes-${densite}`} id="causes" titre="Causes et évolution" resume="Causes citées par l'ARS et évolution du nombre de communes concernées" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Causes citées par l'ARS ({ys})</h2>
          {causesOption ? <Chart option={causesOption} height={340} exportName={`avis-causes-${ys}`} /> : <p className="muted">Aucun avis ce millésime.</p>}
          <div className="source">Nombre de prélèvements ayant donné lieu à un avis, par cause citée dans la conclusion. Une conclusion peut citer plusieurs causes.</div>
        </div>
        <div className="card">
          <h2>Évolution</h2>
          {evolutionOption && <Chart option={evolutionOption} height={340} exportName="avis-evolution" />}
          <div className="source">
            Nombre de communes rattachées à au moins un avis de chaque catégorie. Le millésime en cours, en barres hachurées, est incomplet.
            {muetsMax > 0 &&
              ` Le nombre de départements sans information, où aucune conclusion n’évoque de consigne, ${muetsMin === muetsMax ? `est de ${muetsMax} chaque année` : `varie de ${muetsMin} à ${muetsMax} selon l’année`} ; l’évolution doit donc être interprétée avec prudence.`}
          </div>
        </div>
      </div>
      </Section>

      <div className="source">
        Source : conclusions sanitaires des prélèvements, contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, ARS). Ces conclusions sont
        rédigées en texte libre. Le site les classe automatiquement, phrase par phrase, en tenant compte des négations (« n'entraînant pas de
        mesure de restriction »), des levées de restriction, des seuils seulement rappelés et des mesures seulement envisagées. Un avis émis sur
        un réseau est rattaché à toutes les communes que ce réseau dessert, même lorsqu'il ne visait qu'un secteur. Les avis limités à un
        bâtiment, à un point d'usage ou au seul point de prélèvement sont comptés à part. Dans un département où aucune conclusion de l'année
        n'évoque de consigne, qu'il s'agisse de la prescrire ou de l'écarter, l'absence d'avis ne permet aucune conclusion ; le site y indique
        « pas d'information ». <Link to="/methode#avis">Méthode</Link>.
      </div>
    </div>
  )
}

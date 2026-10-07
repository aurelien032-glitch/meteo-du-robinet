import BarreAnnee from '../components/BarreAnnee'
import CarteDept from '../components/CarteDept'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import { infoBulleLettre, useLettresCommunes } from '../components/CarteClassesCommunes'
import CommunesAvis from '../components/CommunesAvis'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import ReseauxConcernes from '../components/ReseauxConcernes'
import Search from '../components/Search'
import TableauDepartements from '../components/TableauDepartements'
import TableauDeptsTri, { type Colonne } from '../components/TableauDeptsTri'
import { lignesCarte, pctCsv, type Effectif, type LigneCarte } from '../lib/tableauDepts'
import { departementSansInformation, phraseCarteSansInformation, resumeSansInformation } from '../lib/avis'
import { fmt, majuscule } from '../lib/data'
import { classesScale, comptesParDepartement, infoBulleDept, legendeClasses, lignesFrance, partCD, PHRASE_PART } from '../lib/france'
import { libelleParametre } from '../lib/parametres'
import { useDepartements } from '../lib/geo'
import { GROUPES_DEPT, INDICS_DEPT } from '../lib/indicateursDept'
import {
  agregerDepartements,
  agregerParametre,
  aVueCommunale,
  detailDepartement,
  enteteClassement,
  FAMILLE_DU_PARAM,
  formaterValeur,
  INDICS,
  MESURES,
  PAGE_OF,
  STEPS_AVIS,
  STEPS_TAUX,
  valeurParametre,
  type IndicKey,
  type Mesure,
} from '../lib/indicateursCarte'
import { echelleCommune, etatCommune, infoBulleCommune, niveauxCommune, valeurCommune } from '../lib/indicateursCommunes'
import Chargement from '../components/Chargement'
import { useJson } from '../lib/hooks'
import { BORNES_RESTRICTIONS, ETIQUETTES_RESTRICTIONS, partRestrictions } from '../lib/carte'
import { EFFECTIF_MIN, reseauxParDept } from '../lib/classement'
import { NBSP, familleBulletin } from '../lib/instruments'
import { niceScale, qualiteScale, stepScale } from '../lib/scale'
import {
  legendeSituation,
  partNonConformes,
  reseauxAnalyses,
  type SituationsFile,
} from '../lib/situations'
import {
  AVIS_SANS_INFORMATION,
  communeDeRattachement,
  deptOfInsee,
  type AvisNationalFile,
  type CommuneIndexEntry,
  type MapFile,
  type MapRow,
  type MetaFile,
  type ParamsFile,
  type SeriesFile,
  type SeriesIndexEntry,
} from '../lib/types'
import { usePageTitle } from '../lib/title'
import { anneesFiche, useYear } from '../lib/year'
import Crumbs from '../components/Crumbs'
import IndicInconnu from '../components/IndicInconnu'

const pctBorne = fmt.pctBorne

export default function Carte() {
  const meta = useJson<MetaFile>('meta.json').data
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  // Tout l'état de la vue est dans l'URL : indicateur, paramètre, mesure, département sélectionné, fond de carte.
  // Une vue se partage, se rejoue en scène, et le bouton « précédent » du navigateur fonctionne.
  const [sp, setSp] = useSearchParams()
  // Indicateur d'une page « Comprendre » (services d'eau, ressource, amont ; lib/indicateursDept.ts) : sa carte,
  // départementale, et communale pour les services d'eau, remplace celle de l'eau du robinet (components/CarteDept.tsx).
  const externe = INDICS_DEPT.find((i) => i.key === sp.get('indic')) ?? null
  const indic = (INDICS.some((i) => i.key === sp.get('indic')) ? sp.get('indic') : 'pesticides') as IndicKey
  const indicInconnu = !!sp.get('indic') && !INDICS.some((i) => i.key === sp.get('indic')) && !INDICS_DEPT.some((i) => i.key === sp.get('indic'))
  const mesure = (MESURES.some((m) => m.key === sp.get('mesure')) ? sp.get('mesure') : 'share') as Mesure
  const deptUrl = sp.get('dept')
  const fondCommunes = sp.get('fond') === 'communes'
  const [survol, setSurvol] = useState<string | null>(null)
  const [survolCommune, setSurvolCommune] = useState<string | null>(null)
  const [tout, setTout] = useState(false)
  const setQ = useCallback(
    (entries: Record<string, string | null>) => {
      const next = new URLSearchParams(sp)
      for (const [k, v] of Object.entries(entries)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      setSp(next)
    },
    [sp, setSp],
  )
  // Vue de la carte transmise à la fiche du département, indicateur compris même quand c'est celui par défaut.
  const versFiche = useMemo(() => {
    const q = new URLSearchParams(sp)
    if (!q.has('indic')) q.set('indic', externe ? externe.key : indic)
    return q.toString()
  }, [sp, externe, indic])
  /** Fiche d'un département choisi dans l'encart de la carte : la vue courante, sans le département sélectionné. */
  const ficheDe = (dd: string) => {
    const q = new URLSearchParams(versFiche)
    q.delete('dept')
    return `/departement/${dd}?${q.toString()}`
  }
  // Équivalent en URL de setQ({ dept }) : sert de destination à un <Link>, pour que sélectionner un
  // département depuis le classement reste possible au clavier (setQ seul n'est accessible qu'au clic).
  const deptHref = useCallback(
    (d: string) => {
      const next = new URLSearchParams(sp)
      next.set('dept', d)
      return next.toString()
    },
    [sp],
  )
  // Contours et noms des départements ; les noms arrivent avant les contours (lib/geo.ts), le titre aussi.
  const { deps, names: deptName } = useDepartements()
  const avecContour = useMemo(() => new Set((deps?.features ?? []).map((f) => String(f.properties?.code))), [deps])
  // Un code de département inconnu (adresse retouchée, lien périmé) est ignoré : sans cela la page afficherait
  // une carte vide sous un titre inventé. Tant que les contours ne sont pas chargés, on fait confiance à l'URL.
  const dept = deptUrl && (avecContour.size === 0 || avecContour.has(deptUrl)) ? deptUrl : null
  // La souris peut rester immobile sur la carte après un clic : sans cela, la mise en évidence resterait
  // accrochée à l'entité précédente en changeant d'indicateur, de millésime ou de vue.
  useEffect(() => {
    setSurvol(null)
    setSurvolCommune(null)
    setTout(false)
  }, [indic, externe, mesure, dept, fondCommunes, y])
  const params = useJson<ParamsFile>('params.json').data
  const seriesIndex = useJson<SeriesIndexEntry[]>('series/index.json').data
  // Un code inconnu dans l'URL retombe sur les nitrates plutôt que sur une carte vide.
  const paramUrl = sp.get('param')
  const param = paramUrl && (!seriesIndex || seriesIndex.some((e) => e.code === paramUrl)) ? paramUrl : '1340'
  const ind = INDICS.find((i) => i.key === indic)!
  const isParam = ind.kind === 'param'
  // Le niveau communal existe pour les indicateurs de famille et pour ceux des services d'eau (`commune`, chaque
  // commune y prend la valeur de son service) : en mode paramètre et pour les autres sources, la carte reste
  // départementale (auteur, 24/09 : « il manque l'option Toutes les communes » aux thèmes des services d'eau).
  const communesPossibles = externe ? !!externe.commune : !isParam
  // Classes A–D : la lettre d'une commune se lit dans le fichier de son département (réseaux de chaque commune), un
  // département à la fois ; pas de fond « toutes les communes », qui chargerait les cent fichiers.
  const isClasses = ind.kind === 'classes'
  const vueCommunes = communesPossibles && (dept != null || (fondCommunes && !isClasses))

  // Rien de l'eau du robinet n'est chargé pour un indicateur départemental d'une autre source.
  const communes = useJson<FeatureCollection>(!externe && !isParam && dept ? `geo/communes/${dept}.json` : null).data
  const communesFrance = useJson<FeatureCollection>(!externe && !isParam && !isClasses && !dept && fondCommunes ? 'geo/communes-1000m.json' : null).data
  const index = useJson<CommuneIndexEntry[]>(!externe ? 'communes.json' : null).data
  const nameOf = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const map = useJson<MapFile>(!externe && y ? `map/${y}.json` : null).data
  // Situations des réseaux (bilans du ministère), par année.
  const situ = useJson<SituationsFile>(!externe && y ? `situations/${y}.json` : null).data
  // Classes A–D : comptes par département, lettre de chaque commune du département affiché (lib/france.ts).
  const comptesDept = useMemo(() => (isClasses ? comptesParDepartement(situ) : new Map()), [isClasses, situ])
  const lettresDept = useLettresCommunes(isClasses && dept ? dept : null, y, situ)
  // Départements « sans information » de l'année (avis.sans_information du pipeline) : hachurés, pas « aucun avis ».
  const avisNat = useJson<AvisNationalFile>(ind.kind === 'avis' || ind.kind === 'restriction' ? 'avis/national.json' : null).data
  const serieState = useJson<SeriesFile>(isParam ? `series/${param}.json` : null)
  const serie = serieState.data
  const nav = useNavigate()
  const paramInfo = seriesIndex?.find((e) => e.code === param)
  const mesureLabel = MESURES.find((m) => m.key === mesure)!.label
  // Un nombre brut d'analyses dépend autant du volume de contrôle que de l'eau : la légende le rappelle.
  const desc = isParam
    ? `${mesureLabel} · ${libelleParametre(param, paramInfo?.l)}${(mesure === 'share' || mesure === 'nd') && paramInfo?.lim ? ` (${fmt.seuil(paramInfo.lim)})` : ''}${mesure === 'nd' ? ', nombre brut, plus élevé là où les analyses sont plus nombreuses' : ''}`
    : ind.desc
  // Le titre dit la vue réellement affichée : en fond communal, « Carte des départements » faisait croire à un retour
  // au niveau départemental (revue du 24/09).
  usePageTitle(
    vueCommunes ? (dept ? `Carte des communes · département ${dept}` : 'Carte de toutes les communes') : 'Carte des départements',
    externe
      ? vueCommunes && externe.commune
        ? `Carte des communes : ${externe.commune.desc}.`
        : `Carte des départements : ${externe.label}.`
      : `Carte de la qualité de l'eau du robinet : ${desc}.`,
  )
  // Un paramètre organique ou physico-chimique soumis à une limite relève des autres limites de qualité (lib/instruments.ts,
  // familleBulletin) ; sans limite (pH, conductivité : références seules), d'aucune famille jugée.
  const indicFamille: IndicKey = FAMILLE_DU_PARAM[paramInfo?.lim ? familleBulletin(paramInfo.f, paramInfo.code) : (paramInfo?.f ?? '')] ?? 'any'

  const deptAgg = useMemo(() => agregerDepartements(map, avecContour), [map, avecContour])
  const paramAgg = useMemo(() => agregerParametre(serie, y), [serie, y])
  const paramMax = useMemo(() => Math.max(0, ...[...paramAgg.values()].map((a) => valeurParametre(a, mesure) ?? 0)), [paramAgg, mesure])

  const valueOfDept = useCallback(
    (code: string): number | null => {
      if (isParam) {
        const a = paramAgg.get(code)
        return a ? valeurParametre(a, mesure) : null
      }
      if (ind.kind === 'classes') return partCD(comptesDept.get(code))
      if (ind.kind === 'situation') return partNonConformes(situ?.depts[code]?.[ind.fam!], ind.fam!)
      if (ind.kind === 'restriction') {
        // Département sans information (règle « pas d'information » étendue aux restrictions, choix de l'auteur, 27/09) :
        // aucune restriction trouvée n'y prouve pas qu'il n'y en a pas eu.
        const v = partRestrictions(situ?.depts[code]?.toutes)
        return v === 0 && departementSansInformation(avisNat, code, String(y)) ? null : v
      }
      const a = deptAgg.get(code)
      if (!a || a.n === 0) return null
      if (ind.kind === 'avis') return a.hit || !departementSansInformation(avisNat, code, String(y)) ? a.hit : null
      return ind.key === 'bact' ? (a.neb ? a.ncb / a.neb : null) : a.nec ? a.ncc / a.nec : null
    },
    [deptAgg, paramAgg, ind, isParam, mesure, situ, avisNat, y, comptesDept],
  )
  const fmtValue = useCallback((v: number | null) => formaterValeur(ind, v, isParam ? mesure : null, paramInfo?.u), [isParam, mesure, paramInfo, ind])

  // Une seule source pour les couleurs et pour la légende : elles ne peuvent pas diverger.
  const scaleDept = useMemo(
    // Parts de réseaux non conformes : rampe de la qualité de l'eau à 5, 10, 20, 40 %, la même que l'accueil et les thèmes.
    () =>
      isParam
        ? niceScale(0, paramMax, { entier: mesure === 'nd', rampe: 'qualite' })
        : ind.kind === 'situation' || ind.kind === 'classes'
          ? qualiteScale()
          : ind.kind === 'taux'
            ? stepScale(STEPS_TAUX, { rampe: 'qualite' })
            : stepScale(ind.kind === 'restriction' ? BORNES_RESTRICTIONS : STEPS_AVIS, { premierAucun: true, rampe: 'qualite' }),
    [isParam, paramMax, mesure, ind],
  )
  const scaleCommune = useMemo(() => (ind.kind === 'classes' ? classesScale : aVueCommunale(ind) ? echelleCommune(ind) : stepScale(STEPS_TAUX, { rampe: 'qualite' })), [ind])

  const colorDept = useCallback((p: Record<string, unknown>) => scaleDept.color(valueOfDept(String(p.code))), [scaleDept, valueOfDept])
  const labelDept = useCallback(
    (p: Record<string, unknown>) => {
      if (ind.kind === 'classes') return infoBulleDept(String(p.nom), String(p.code), comptesDept.get(String(p.code)), y ?? '')
      const v = valueOfDept(String(p.code))
      if (ind.kind === 'avis' && v == null && y)
        return `<b>${p.nom}</b> (${p.code})<br>${AVIS_SANS_INFORMATION}${NBSP}: ${resumeSansInformation(String(y), avisNat?.lecture?.[String(p.code)]?.[String(y)]?.[0] ?? 0)}`
      const a = paramAgg.get(String(p.code))
      const extra = isParam && a ? ` · ${fmt.int(a.n)} analyses` : ''
      return `<b>${p.nom}</b> (${p.code})<br>${fmtValue(v)} · ${desc}${extra}${detailDepartement(ind, situ?.depts[String(p.code)], y)}`
    },
    [valueOfDept, fmtValue, desc, isParam, paramAgg, ind, situ, avisNat, y, comptesDept],
  )

  // Situation, restriction et avis comme sur la fiche département (lib/indicateursCommunes.ts) ; taux de prélèvements
  // non conformes de la commune.
  const valueOfCommune = useCallback(
    (row: MapRow | undefined): number | null => {
      if (aVueCommunale(ind)) return valeurCommune(ind, row)
      if (!row || row[0] === 0) return null
      return ind.key === 'bact' ? (row[2] ? row[1] / row[2] : null) : row[4] ? row[3] / row[4] : null
    },
    [ind],
  )
  // Un arrondissement de Paris, Marseille ou Lyon prend les données de sa commune (communeDeRattachement) : le
  // contrôle sanitaire ne connaît que la commune, et Paris paraissait « sans prélèvement ».
  const colorCommune = useCallback(
    (p: Record<string, unknown>) =>
      ind.kind === 'classes' ? lettresDept.couleur(p) : scaleCommune.color(valueOfCommune(map?.[communeDeRattachement(String(p.code))])),
    [map, valueOfCommune, scaleCommune, ind, lettresDept],
  )
  const labelCommune = useCallback(
    (p: Record<string, unknown>) =>
      ind.kind === 'classes'
        ? infoBulleLettre(p, nameOf, lettresDept.lettreDe(String(p.code)), y ?? '')
        : infoBulleCommune(p, map, nameOf, y, (row) => (aVueCommunale(ind) ? etatCommune(ind, row, y) : fmt.pct(100 * (valueOfCommune(row) ?? 0), 1))),
    [map, valueOfCommune, ind, y, nameOf, lettresDept],
  )

  // Paramètres proposés, groupés par famille.
  const paramGroups = useMemo(() => {
    const g = new Map<string, SeriesIndexEntry[]>()
    for (const e of seriesIndex ?? []) g.set(e.f, [...(g.get(e.f) ?? []), e])
    return [...g.entries()]
  }, [seriesIndex])

  // Classement des communes du département affiché, pour les avis de l'ARS et les taux de prélèvements non conformes :
  // les familles et les restrictions ont la liste des réseaux concernés (ReseauxConcernes), jamais des communes.
  const classementCommunes = useMemo(() => {
    if (!vueCommunes || !dept || !map || (ind.kind !== 'avis' && ind.kind !== 'taux')) return []
    return Object.entries(map)
      .filter(([insee]) => deptOfInsee(insee) === dept)
      .map(([insee, row]) => ({ insee, nom: nameOf.get(insee) ?? insee, plv: row[0], v: valueOfCommune(row) ?? 0 }))
      // Communes qui ont reçu un avis, ou dont au moins un prélèvement est non conforme.
      .filter((c) => c.plv > 0 && c.v > 0)
      // Avis le plus grave, ou taux le plus élevé, d'abord ; puis le nombre de prélèvements.
      .sort((a, b) => b.v - a.v || b.plv - a.plv)
  }, [vueCommunes, dept, map, nameOf, valueOfCommune, ind])

  // Effectif d'une part (lib/classement.ts) : réseaux analysés, analyses du paramètre ou prélèvements évalués, avec le
  // total de réseaux du département quand il est connu ; null quand l'indicateur n'est pas une part (avis, nombres,
  // maxima), qui se classe tel quel.
  const totaux = useMemo(() => reseauxParDept(situ), [situ])
  const effectif = useCallback(
    (d: string): Effectif | null => {
      if (isParam) {
        const a = paramAgg.get(d)
        return mesure === 'share' && a ? { n: a.n, unite: ['analyse', 'analyses'] } : null
      }
      if (ind.kind === 'classes') {
        const c = comptesDept.get(d)
        return c ? { n: c.classes, unite: ['réseau classé', 'réseaux classés'], total: c.classes + c.nonClasses } : null
      }
      if (ind.kind === 'situation' || ind.kind === 'restriction') {
        const r = situ?.depts[d]?.[ind.kind === 'situation' ? ind.fam! : 'toutes']
        return r ? { n: reseauxAnalyses(r), unite: ['réseau analysé', 'réseaux analysés'], total: totaux.get(d) } : null
      }
      const a = deptAgg.get(d)
      return ind.kind === 'taux' && a ? { n: ind.key === 'bact' ? a.neb : a.nec, unite: ['prélèvement évalué', 'prélèvements évalués'] } : null
    },
    [isParam, paramAgg, mesure, ind, situ, totaux, deptAgg, comptesDept],
  )
  // Tableau des départements (refonte, lot 4) : version textuelle de toute la carte, par ordre alphabétique, sans palmarès ;
  // tri au choix du visiteur, les parts trop peu étayées en fin de liste (lib/tableauDepts.ts, règle des classements).
  // Un département « sans information » sur les avis ou les restrictions y figure, avec la mention, jamais « aucun avis ».
  const sansInfo = useCallback(
    (d: string) => (ind.kind === 'avis' || ind.kind === 'restriction') && !!y && departementSansInformation(avisNat, d, String(y)),
    [ind, y, avisNat],
  )
  const lignesTableau = useMemo(
    () =>
      lignesCarte(isParam ? paramAgg.keys() : deptAgg.keys(), valueOfDept, effectif, (d) => deptName.get(d) ?? d, (d, v) => v != null || sansInfo(d)),
    [isParam, paramAgg, deptAgg, valueOfDept, effectif, deptName, sansInfo],
  )
  // Une part (0–1) s'écrit en % dans le CSV ; un nombre (avis, analyses) ou un maximum tel quel.
  const estPart = isParam ? mesure === 'share' : ind.kind !== 'avis'
  const enteteValeur = enteteClassement(ind, isParam ? mesure : null)
  const uniteEffectif = lignesTableau.find((l) => l.e)?.e?.unite
  const avecEffectif = lignesTableau.some((l) => l.e)
  const colonnesCarte = useMemo<Colonne<LigneCarte>[]>(
    () => ([
      {
        cle: 'v',
        titre: enteteValeur,
        quoi: `la valeur de l’indicateur (${enteteValeur.toLowerCase()})`,
        num: true,
        valeur: (l) => l.v,
        classable: (l) => l.classable,
        cellule: (l) => (l.v == null && sansInfo(l.dd) ? <span className="muted">{AVIS_SANS_INFORMATION}</span> : fmtValue(l.v)),
      },
      {
        cle: 'e',
        titre: uniteEffectif ? majuscule(uniteEffectif[1]) : 'Effectif',
        num: true,
        cellule: (l) =>
          l.e ? (
            <>
              {fmt.int(l.e.n)}
              {!l.classable && (
                <span className="muted">
                  {' '}
                  <abbr title={`Part calculée sur moins de ${EFFECTIF_MIN} ${l.e.unite[1]} : hors des tris`}>(hors tri)</abbr>
                </span>
              )}
            </>
          ) : (
            '–'
          ),
      },
    ] satisfies Colonne<LigneCarte>[]).slice(0, avecEffectif ? 2 : 1),
    [enteteValeur, sansInfo, fmtValue, avecEffectif],
  )
  // Classes A–D : le tableau des départements de « La France », alphabétique, au lieu d'un classement (aucun palmarès).
  const lignesClasses = useMemo(() => (isClasses ? lignesFrance(comptesDept, (d) => deptName.get(d) ?? d) : []), [isClasses, comptesDept, deptName])
  const communesSansInfo = useMemo(
    () => vueCommunes && (ind.kind === 'avis' || ind.kind === 'restriction') && !!map && Object.entries(map).some(([insee, r]) => r[14] === null && (!dept || deptOfInsee(insee) === dept)),
    [vueCommunes, ind, map, dept],
  )
  const nbMuets = ind.kind === 'avis' && y ? (avisNat?.sans_information?.[String(y)]?.length ?? 0) : 0
  const deptMuet = ind.kind === 'avis' && !!dept && !!y && departementSansInformation(avisNat, dept, String(y))
  const selection = survol ?? dept
  // La barre d'année (meta.json) et les menus de paramètres (params.json) arrivaient après la carte et la décalaient
  // (audit UI UX Pro Max du 2026-10-06) : la page attend ces deux fichiers.
  if (!meta || !params) return <Chargement reserve />

  return (
    <div className="page">
      <p className="eyebrow">La France</p>
      <Crumbs items={[{ label: 'La France', to: '/france' }, { label: 'Carte détaillée' }]} />
      <div className="toolbar">
        <h1>
          {vueCommunes
            ? dept
              ? `${deptName.get(dept) ?? dept} · communes`
              : 'Toutes les communes'
            : isParam && dept
              ? `${deptName.get(dept) ?? dept} sélectionné`
              : 'Carte des départements'}
        </h1>
        <label>
          Indicateur{' '}
          <select
            value={externe ? externe.key : indic}
            onChange={(e) => {
              const k = e.target.value
              const cible = INDICS_DEPT.find((i) => i.key === k)
              // Un indicateur départemental n'a pas de paramètre ; sans vue communale, département choisi et fond communal
              // tombent aussi. Ceux des services d'eau gardent la vue communale en cours, comme ceux de l'eau du robinet.
              const sansCommunes = cible && !cible.commune
              setQ({
                indic: k,
                ...(k === 'param' || k === 'classes' || sansCommunes ? { fond: null } : {}),
                ...(cible ? { param: null, mesure: null, ...(sansCommunes ? { dept: null } : {}) } : { sispea: null }),
              })
            }}
          >
            <optgroup label="Au robinet">
              {INDICS.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </optgroup>
            {GROUPES_DEPT.map((g) => (
              <optgroup key={g} label={g}>
                {INDICS_DEPT.filter((i) => i.groupe === g).map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.menu}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {indicInconnu && <IndicInconnu affiche={ind.label} />}
        {isParam && (
          <label>
            Paramètre{' '}
            <select value={param} onChange={(e) => setQ({ param: e.target.value })}>
              {paramGroups.map(([f, list]) => (
                <optgroup key={f} label={params?.familles[f as keyof ParamsFile['familles']] ?? f}>
                  {list.map((e) => (
                    <option key={e.code} value={e.code}>
                      {e.k ?? libelleParametre(e.code, e.l)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {isParam && (
          <label>
            Mesure{' '}
            <select value={mesure} onChange={(e) => setQ({ mesure: e.target.value })}>
              {MESURES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {externe ? (
          <Link to={externe.page.to} className="btn">
            {externe.page.label}
          </Link>
        ) : ind.theme ? (
          <Link to={`/themes/${ind.theme}`} className="btn">
            Voir le thème
          </Link>
        ) : (
          PAGE_OF[indic] && (
            <Link to={PAGE_OF[indic].to} className="btn">
              {PAGE_OF[indic].label}
            </Link>
          )
        )}
        {dept && (!externe || externe.commune) && (
          // Toute la vue courante (indicateur, paramètre, mesure, millésime) part avec le lien : la fiche
          // département ne fait pas table rase de ce qu'on regardait, et le retour la restitue à l'identique.
          // L'indicateur affiché part toujours avec le lien, même celui par défaut, absent de l'URL : sans lui, la fiche
          // s'ouvrait sur « Toutes familles » au lieu de ce qu'on regardait (relecture du 25/09).
          <Link to={`/departement/${dept}?${versFiche}`} className="btn" viewTransition>
            Fiche du département
          </Link>
        )}
        {dept && (!externe || externe.commune) && (
          <button className="btn" onClick={() => setQ({ dept: null })}>
            {vueCommunes ? '← France entière' : '✕ Désélectionner'}
          </button>
        )}
        {!dept && communesPossibles && !isClasses && (
          <button className="btn" onClick={() => setQ({ fond: fondCommunes ? null : 'communes' })} title="Fond communal simplifié à 1 km, 7 Mo">
            {fondCommunes ? 'Départements' : 'Toutes les communes'}
          </button>
        )}
      </div>
      {isParam && (
        // Sans cette phrase, le bouton « Toutes les communes » disparaissait et le clic sur un département ne
        // faisait que le sélectionner, sans que rien ne dise pourquoi (revue du 24/09). Le lien du thème
        // (« Voir sur la carte ») ouvre la carte dans ce mode.
        <p className="muted">
          Les résultats d’un paramètre sont présentés par département, car ses analyses ne sont pas publiées commune par commune.{' '}
          <button type="button" className="btn-link" onClick={() => setQ({ indic: indicFamille, ...(dept ? {} : { fond: 'communes' }) })}>
            {dept ? 'Voir ses communes' : 'Voir les communes'} ({INDICS.find((i) => i.key === indicFamille)!.label.toLowerCase()}) →
          </button>
        </p>
      )}
      {externe ? (
        // Sans `key` : d'un indicateur départemental à l'autre, la carte se recolore au lieu d'être recréée.
        <CarteDept ind={externe} deps={deps} deptName={deptName} dept={dept} fondCommunes={fondCommunes} />
      ) : (
      <>
      {/* L'année, au-dessus de ce qu'elle gouverne (règle de l'auteur, 23/09) : la carte et le classement. */}
      <BarreAnnee
        titre="Année du bilan"
        note={
          vueCommunes
            ? dept
              ? isClasses
                ? 'Elle vaut pour la carte et la liste des réseaux notés C ou D.'
                : ind.kind === 'situation' || ind.kind === 'restriction'
                ? 'Elle vaut pour la carte et la liste des réseaux concernés.'
                : 'Elle vaut pour la carte et la liste des communes.'
              : 'Elle vaut pour la carte.'
            : isClasses
              ? 'Elle vaut pour la carte et le tableau des départements.'
              : 'Elle vaut pour la carte et le tableau des départements.'
        }
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setYear}
      />
      <div className="grid cols-map">
        <div>
          {vueCommunes ? (
            <FranceMap
              key={dept ? `communes-${dept}` : 'communes-france'}
              data={dept ? (isClasses && !lettresDept.pret ? null : communes) : communesFrance}
              colorOf={colorCommune}
              labelOf={labelCommune}
              onClick={(p) => nav(`/commune/${communeDeRattachement(String(p.code))}`, { viewTransition: true })}
              onHover={dept ? (p) => setSurvolCommune(p ? communeDeRattachement(String(p.code)) : null) : undefined}
              selected={dept ? survolCommune : null}
              height={620}
              ariaLabel={
                dept
                  ? ind.kind === 'situation' || ind.kind === 'restriction' || isClasses
                    ? 'Carte des communes du département ; les réseaux concernés sont listés à côté'
                    : 'Carte des communes du département ; les communes concernées sont listées à côté'
                  : 'Carte de toutes les communes de France'
              }
            />
          ) : (
            <FranceMap
              key="departements"
              data={deps}
              colorOf={colorDept}
              labelOf={labelDept}
              // Encart (choix de l'auteur, 25/09) : le zoom sur les communes et la fiche, qui reçoit toute la vue courante.
              encart={(dd) => ({ fiche: ficheDe(dd), communes: isParam ? undefined : () => setQ({ dept: dd }) })}
              onHover={(p) => setSurvol(p ? String(p.code) : null)}
              selected={selection}
              height={620}
              ariaLabel="Carte des départements ; le tableau à côté reprend les valeurs"
            />
          )}
          <MapLegend
            desc={vueCommunes && ind.descCommune ? ind.descCommune : desc}
            scale={vueCommunes ? scaleCommune : scaleDept}
            format={(v) => (ind.kind === 'avis' ? fmt.int(v) : !isParam || mesure === 'share' ? pctBorne(v) : fmtValue(v))}
            binaire={
              vueCommunes
                ? aVueCommunale(ind)
                  ? niveauxCommune(ind)
                  : undefined
                : ind.kind === 'restriction'
                  ? ETIQUETTES_RESTRICTIONS
                  : undefined
            }
            premier={!vueCommunes && ind.kind === 'avis' ? 'aucun avis' : undefined}
            cases={vueCommunes && ind.kind === 'situation' ? legendeSituation(ind.fam!, y) : vueCommunes && isClasses ? legendeClasses() : undefined}
            noDataLabel={
              isClasses ? 'aucun réseau classé' : vueCommunes ? (communesSansInfo ? `sans prélèvement ou ${AVIS_SANS_INFORMATION}` : 'sans prélèvement') : ind.kind === 'avis' ? AVIS_SANS_INFORMATION : ind.kind === 'restriction' ? `sans donnée ou ${AVIS_SANS_INFORMATION}` : 'sans donnée'
            }
          />
          {isParam && serieState.error && <p className="muted">Pas de série mensuelle pour ce paramètre ({param}).</p>}
          {isParam && (
            <p className="muted">
              Les analyses de l’année sont cumulées par département
              {paramInfo?.lim
                ? `. Limite de qualité${NBSP}: ${fmt.seuil(paramInfo.lim)}`
                : paramInfo?.ref
                  ? `. Ce paramètre n’a pas de limite de qualité. Référence de qualité${NBSP}: ${fmt.seuil(paramInfo.ref)}`
                  : ''}
              .
            </p>
          )}
        </div>
        <div className="card">
          <h3>Trouver une commune</h3>
          <Search />
          <p className="muted">
            {isParam
              ? 'Le survol d’un département indique sa valeur ; un clic ouvre sa fiche.'
              : vueCommunes
                ? 'Un clic sur une commune ouvre sa fiche.'
                : isClasses
                  ? 'Un clic sur un département ouvre sa fiche, qui porte la carte de ses communes. La carte de toutes les communes n’est pas proposée pour les classes, qui se lisent département par département.'
                  : 'Un clic sur un département ouvre sa fiche, qui porte la carte de ses communes.'}
          </p>
          {isClasses && <p className="cap">Classes calculées par le site selon la méthode de l’indicateur de l’ARS ; la synthèse de l’ARS jointe à la facture d’eau fait foi et peut différer. <Link to="/methode#classe-ars">Méthode</Link>.</p>}
          {/* Des réseaux, pas des communes (choix de l'auteur, 24/09, règle du projet) : une analyse au-dessus de la limite
              ne touche pas une commune entière. Les avis de l'ARS, qui visent des communes, et les taux de prélèvements
              non conformes, calculés commune par commune, gardent leur liste de communes, sans compte pour les taux. */}
          {vueCommunes && dept && isClasses && <ReseauxConcernes dept={dept} annee={y ?? ''} situ={situ} critere="classes" libelle={ind.label} />}
          {!vueCommunes && isClasses && lignesClasses.length > 0 && (
            <>
              <h3>Les départements</h3>
              <p className="muted">{PHRASE_PART}</p>
              <TableauDepartements lignes={lignesClasses} annee={y ?? ''} lien={(d) => `?${deptHref(d)}`} selection={selection} onSurvol={setSurvol} />
            </>
          )}
          {vueCommunes && dept && (ind.kind === 'situation' || ind.kind === 'restriction') && (
            <ReseauxConcernes dept={dept} annee={y ?? ''} situ={situ} critere={ind.kind === 'restriction' ? 'restriction' : ind.fam!} libelle={ind.label} />
          )}
          {vueCommunes && dept && (ind.kind === 'avis' || ind.kind === 'taux') && (
            <>
              <h3>
                {ind.kind === 'avis'
                  ? `Communes ayant reçu un avis de l'ARS${classementCommunes.length ? ` (${classementCommunes.length})` : ''}`
                  : 'Communes aux prélèvements non conformes'}
              </h3>
              {classementCommunes.length === 0 ? (
                <p className="muted">
                  {deptMuet
                    ? phraseCarteSansInformation(String(y), avisNat?.lecture?.[dept]?.[String(y)]?.[0] ?? 0)
                    : `Aucune commune du département n'est concernée par cet indicateur en ${y}.`}
                </p>
              ) : (
                <CommunesAvis
                  communes={tout ? classementCommunes : classementCommunes.slice(0, 15)}
                  legende="Communes concernées, version textuelle de la carte"
                  taux={ind.kind === 'taux'}
                  survol={survolCommune}
                  onSurvol={setSurvolCommune}
                />
              )}
              {classementCommunes.length > 15 && (
                <p className="muted">
                  {tout ? `${classementCommunes.length} communes` : `15 premières sur ${classementCommunes.length}`}{' · '}
                  <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
                    {tout ? 'voir les 15 premières' : 'voir toutes les communes'}
                  </button>
                </p>
              )}
            </>
          )}
          {!vueCommunes && !isClasses && lignesTableau.length > 0 && (
            <>
              <h3>Les départements</h3>
              <p className="muted">Par ordre alphabétique ; un tri est proposé. Un lien affiche le département sur la carte.</p>
              <TableauDeptsTri
                lignes={lignesTableau}
                colonnes={colonnesCarte}
                lien={(d) => `?${deptHref(d)}`}
                legende={`Les départements, par ordre alphabétique ou selon le tri choisi : ${desc}, ${y ?? ''} ; version textuelle de la carte`}
                selection={selection}
                onSurvol={setSurvol}
                unite={uniteEffectif?.[1] ?? 'réseaux analysés'}
                csv={{
                  sujet: `carte-${isParam ? `parametre-${param}-${mesure}` : indic}`,
                  annee: y ?? '',
                  entetes: ['Code du département', 'Département', 'Année', `${enteteValeur}${estPart ? ' (%)' : ''}`, 'Effectif', 'Unité de l’effectif', 'Valeur retenue dans les tris'],
                  ligne: (l) => [l.dd, l.nom, String(y ?? ''), estPart ? pctCsv(l.v) : l.v, l.e?.n ?? null, l.e?.unite[1] ?? null, l.classable ? 'oui' : 'non'],
                  note: `Indicateur : ${desc} ; séparateur point-virgule.`,
                }}
              />
              {nbMuets > 0 && (
                <p className="muted">
                  En {y}, aucune conclusion de l’ARS n’évoque de consigne dans {fmt.nb(nbMuets, 'département')}, qu’il s’agisse d’en prescrire une ou de
                  l’écarter. Ces départements sont hachurés sur la carte, avec la mention « {AVIS_SANS_INFORMATION} ». <Link to={`/avis?annee=${y}`}>Liste et méthode</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      </>
      )}
      <div className="source">
        {externe ? externe.sourceTexte : 'Source : contrôle sanitaire SISE-Eaux (ministère de la Santé).'} Contours : Etalab / IGN Admin Express.
      </div>
    </div>
  )
}

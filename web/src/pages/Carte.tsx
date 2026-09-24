import BarreAnnee from '../components/BarreAnnee'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Search from '../components/Search'
import { departementSansInformation, phraseCarteSansInformation, resumeSansInformation } from '../lib/avis'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { pctCarte } from '../lib/carte'
import { NBSP } from '../lib/instruments'
import { ardoiseScale, avisScale, niceScale, stepScale } from '../lib/scale'
import { classesNonConformes, codeFamille, libellesCourts, libellesSituation, nbClasses, partNonConformes, situationScale, type FamilleSitu, type SituationsFile } from '../lib/situations'
import {
  AVIS_PAR_CODE,
  AVIS_SANS_INFORMATION,
  deptCode,
  deptOfInsee,
  libelleAvisCarte,
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

type IndicKey = 'pesticides' | 'azote' | 'pfas' | 'microbio' | 'any' | 'avis' | 'bact' | 'chim' | 'param'
type Mesure = 'share' | 'nd' | 'max'

/**
 * Indicateurs de la carte (revue du 2026-09-22, décisions de l'auteur) :
 *  · `situation` : part des RÉSEAUX de distribution non conformes, à la manière des bilans du ministère de la
 *    Santé (lib/situations.ts) ; en vue communale, situation du réseau le plus défavorable qui dessert la
 *    commune. Ni part de communes ni part d'habitants : une commune n'est pas touchée en entier parce qu'une
 *    analyse a dépassé la limite, et la population de chaque réseau n'est pas publiée ;
 *  · `avis` : nombre de communes ayant reçu une consigne de l'ARS (une consigne vise bien les habitants) ;
 *  · `taux` : part des prélèvements non conformes, comme les bilans bactériologiques des ARS.
 */
const INDICS: { key: IndicKey; label: string; kind: 'situation' | 'avis' | 'taux' | 'param'; fam?: FamilleSitu; col?: number; desc: string; descCommune?: string; binaire?: string[] }[] = [
  { key: 'pesticides', label: 'Pesticides et métabolites', kind: 'situation', fam: 'pesticides', col: 5, desc: 'part des réseaux non conformes : au moins une analyse de pesticides au-dessus de 0,1 µg/L dans l’année', descCommune: 'situation pesticides du réseau le plus défavorable qui dessert la commune' },
  { key: 'azote', label: 'Nitrates', kind: 'situation', fam: 'azote', col: 6, desc: 'part des réseaux non conformes : au moins une analyse de nitrates au-dessus de 50 mg/L dans l’année', descCommune: 'situation nitrates du réseau le plus défavorable qui dessert la commune' },
  { key: 'pfas', label: 'PFAS', kind: 'situation', fam: 'pfas', col: 7, desc: 'part des réseaux non conformes : somme des 20 PFAS au-dessus de 0,1 µg/L au moins une fois dans l’année', descCommune: 'situation PFAS du réseau le plus défavorable qui dessert la commune' },
  { key: 'microbio', label: 'Bactéries', kind: 'situation', fam: 'microbio', col: 8, desc: 'part des réseaux dont au moins un prélèvement n’est pas conforme en bactériologie', descCommune: 'conformité bactériologique du réseau le plus défavorable qui dessert la commune' },
  { key: 'any', label: 'Toutes familles', kind: 'situation', fam: 'toutes', col: 10, desc: 'part des réseaux non conformes pour au moins une famille de paramètres', descCommune: 'situation la plus défavorable, toutes familles, des réseaux qui desservent la commune' },
  {
    key: 'avis',
    label: "Avis sanitaires de l'ARS",
    kind: 'avis',
    col: 14,
    desc: "nombre de communes ayant reçu au moins une restriction ou une recommandation de consommation de l'ARS",
    descCommune: "commune ayant reçu au moins une restriction ou une recommandation de consommation de l'ARS",
    binaire: ['aucun avis', 'déconseillée aux publics sensibles', "consigne d'ébullition", 'restriction de consommation'],
  },
  { key: 'bact', label: 'Non-conformité bactériologique', kind: 'taux', desc: 'part des prélèvements non conformes (bactériologie)' },
  { key: 'chim', label: 'Non-conformité chimique', kind: 'taux', desc: 'part des prélèvements non conformes (chimie)' },
  { key: 'param', label: 'Un paramètre au choix…', kind: 'param', desc: 'valeur par département pour le paramètre choisi' },
]
const MESURES: { key: Mesure; label: string }[] = [
  { key: 'share', label: 'part des analyses au-dessus de la limite' },
  { key: 'nd', label: "nombre d'analyses au-dessus de la limite" },
  { key: 'max', label: 'valeur maximale mesurée' },
]

const THEME_OF: Partial<Record<IndicKey, string>> = { pesticides: 'pesticides', azote: 'nitrates', pfas: 'pfas', microbio: 'bacteries', bact: 'bacteries' }
/**
 * Indicateur de famille d'un paramètre, pour revenir au niveau communal (revue du 24/09 : « la vue communes
 * n'est pas accessible », en mode paramètre, sans explication) : un paramètre ne se lit que par département,
 * une commune n'a de situation que par famille. Les familles sans indicateur sur la carte (métaux,
 * physico-chimie…) mènent à « Toutes familles ».
 */
const FAMILLE_DU_PARAM: Partial<Record<string, IndicKey>> = { pesticides: 'pesticides', azote: 'azote', pfas: 'pfas', microbio: 'microbio' }
/** Nombre de communes ayant reçu un avis de l'ARS dans l'année (médiane départementale : 25). */
const STEPS_AVIS = [0, 1, 5, 10, 25, 50, 100]
/**
 * Paliers des taux de non-conformité : médiane départementale vers 0,4 % en bactériologie. Sur les
 * paliers des parts de communes (0-5-10… %), 93 départements sur 101 avaient la même teinte.
 */
const STEPS_TAUX = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1]
const pctBorne = fmt.pctBorne

type DeptAgg = { n: number; hit: number; ncb: number; neb: number; ncc: number; nec: number }
type ParamAgg = { n: number; nd: number; max: number | null }

export default function Carte() {
  const meta = useJson<MetaFile>('meta.json').data
  const [y, setYear] = useYear(meta)
  // Tout l'état de la vue est dans l'URL : indicateur, paramètre, mesure, département sélectionné, fond de carte.
  // Une vue se partage, se rejoue en scène, et le bouton « précédent » du navigateur fonctionne.
  const [sp, setSp] = useSearchParams()
  const indic = (INDICS.some((i) => i.key === sp.get('indic')) ? sp.get('indic') : 'pesticides') as IndicKey
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
  const deps = useJson<FeatureCollection>('geo/departements.json').data
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
  }, [indic, mesure, dept, fondCommunes, y])
  const params = useJson<ParamsFile>('params.json').data
  const seriesIndex = useJson<SeriesIndexEntry[]>('series/index.json').data
  // Un code inconnu dans l'URL retombe sur les nitrates plutôt que sur une carte vide.
  const paramUrl = sp.get('param')
  const param = paramUrl && (!seriesIndex || seriesIndex.some((e) => e.code === paramUrl)) ? paramUrl : '1340'
  const ind = INDICS.find((i) => i.key === indic)!
  const isParam = ind.kind === 'param'
  // Le niveau communal n'existe que pour les indicateurs de famille : en mode paramètre, la carte reste départementale.
  const vueCommunes = !isParam && (dept != null || fondCommunes)

  const communes = useJson<FeatureCollection>(!isParam && dept ? `geo/communes/${dept}.json` : null).data
  const communesFrance = useJson<FeatureCollection>(!isParam && !dept && fondCommunes ? 'geo/communes-1000m.json' : null).data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const nameOf = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const map = useJson<MapFile>(y ? `map/${y}.json` : null).data
  // Situations des réseaux (bilans du ministère), par année.
  const situ = useJson<SituationsFile>(y ? `situations/${y}.json` : null).data
  // Départements « sans information » de l'année (avis.sans_information du pipeline) : gris, pas « aucun avis ».
  const avisNat = useJson<AvisNationalFile>(ind.kind === 'avis' ? 'avis/national.json' : null).data
  const serieState = useJson<SeriesFile>(isParam ? `series/${param}.json` : null)
  const serie = serieState.data
  const nav = useNavigate()
  const paramInfo = seriesIndex?.find((e) => e.code === param)
  const mesureLabel = MESURES.find((m) => m.key === mesure)!.label
  // Un nombre brut d'analyses dépend autant du volume de contrôle que de l'eau : la légende le rappelle.
  const desc = isParam
    ? `${mesureLabel} · ${paramInfo?.l ?? param}${(mesure === 'share' || mesure === 'nd') && paramInfo?.lim ? ` (${paramInfo.lim})` : ''}${mesure === 'nd' ? ', nombre brut, mécaniquement plus haut là où l’on analyse davantage' : ''}`
    : ind.desc
  // Le titre dit la vue réellement affichée : en fond communal, « Carte des départements » faisait croire à un retour
  // au niveau départemental (revue du 24/09).
  usePageTitle(vueCommunes ? (dept ? `Carte des communes · département ${dept}` : 'Carte de toutes les communes') : 'Carte des départements', `Carte de la qualité de l'eau du robinet : ${desc}.`)
  const indicFamille: IndicKey = FAMILLE_DU_PARAM[paramInfo?.f ?? ''] ?? 'any'

  const deptAgg = useMemo(() => {
    const agg = new Map<string, DeptAgg>()
    if (!map) return agg
    for (const [insee, row] of Object.entries(map)) {
      const d = deptOfInsee(insee)
      // Saint-Martin et Saint-Barthélemy figurent dans le contrôle sanitaire mais ne sont pas des départements :
      // ils n'ont ni contour ni fiche, on ne les fait donc pas apparaître dans un classement départemental.
      if (avecContour.size && !avecContour.has(d)) continue
      const a = agg.get(d) ?? { n: 0, hit: 0, ncb: 0, neb: 0, ncc: 0, nec: 0 }
      if (row[0] > 0) {
        a.n++
        if (ind.col != null && ((row[ind.col] as number | undefined) ?? 0) > 0) a.hit++
      }
      a.ncb += row[1]
      a.neb += row[2]
      a.ncc += row[3]
      a.nec += row[4]
      agg.set(d, a)
    }
    return agg
  }, [map, ind, avecContour])

  // Mode paramètre : on cumule les mois du millésime dans la série départementale du paramètre.
  const paramAgg = useMemo(() => {
    const agg = new Map<string, ParamAgg>()
    if (!serie || !y) return agg
    const months = serie.mois.map((m, i) => (m.startsWith(`${y}-`) ? i : -1)).filter((i) => i >= 0)
    for (const [sise, d] of Object.entries(serie.depts)) {
      const a: ParamAgg = { n: 0, nd: 0, max: null }
      for (const i of months) {
        a.n += d.n[i] ?? 0
        a.nd += d.nd[i] ?? 0
        const v = d.max[i]
        if (v != null && (a.max == null || v > a.max)) a.max = v
      }
      if (a.n > 0) agg.set(deptCode(sise), a)
    }
    return agg
  }, [serie, y])
  const paramMax = useMemo(() => {
    let m = 0
    for (const a of paramAgg.values()) {
      const v = mesure === 'share' ? a.nd / a.n : mesure === 'nd' ? a.nd : (a.max ?? 0)
      if (v > m) m = v
    }
    return m
  }, [paramAgg, mesure])

  const valueOfDept = useCallback(
    (code: string): number | null => {
      if (isParam) {
        const a = paramAgg.get(code)
        if (!a) return null
        return mesure === 'share' ? a.nd / a.n : mesure === 'nd' ? a.nd : a.max
      }
      if (ind.kind === 'situation') return partNonConformes(situ?.depts[code]?.[ind.fam!], ind.fam!)
      const a = deptAgg.get(code)
      if (!a || a.n === 0) return null
      if (ind.kind === 'avis') return a.hit || !departementSansInformation(avisNat, code, String(y)) ? a.hit : null
      return ind.key === 'bact' ? (a.neb ? a.ncb / a.neb : null) : a.nec ? a.ncc / a.nec : null
    },
    [deptAgg, paramAgg, ind, isParam, mesure, situ, avisNat, y],
  )
  const fmtValue = useCallback(
    (v: number | null) => {
      if (v == null) return ind.kind === 'avis' ? AVIS_SANS_INFORMATION : 'pas de donnée'
      if (ind.kind === 'avis') return `${fmt.int(v)} commune${v > 1 ? 's' : ''}`
      // Une part de réseaux s'écrit sans franchir une borne de la légende (lib/carte.ts).
      if (ind.kind === 'situation') return pctCarte(v)
      if (!isParam || mesure === 'share') return fmt.pct(100 * v, v < 0.1 ? 1 : 0)
      if (mesure === 'nd') return fmt.int(v)
      return `${fmt.dec(v, v >= 10 ? 1 : v >= 1 ? 2 : 3)} ${paramInfo?.u ?? ''}`
    },
    [isParam, mesure, paramInfo, ind],
  )

  // Une seule source pour les couleurs et pour la légende : elles ne peuvent pas diverger.
  const scaleDept = useMemo(
    // Parts de réseaux non conformes : rampe ardoise à 5, 10, 20, 40 %, la même que l'accueil et les thèmes.
    () => (isParam ? niceScale(0, paramMax, { entier: mesure === 'nd' }) : ind.kind === 'situation' ? ardoiseScale() : stepScale(ind.kind === 'taux' ? STEPS_TAUX : STEPS_AVIS)),
    [isParam, paramMax, mesure, ind],
  )
  const scaleCommune = useMemo(
    () => (ind.kind === 'avis' ? avisScale : ind.kind === 'situation' ? situationScale(ind.fam!) : stepScale(STEPS_TAUX)),
    [ind],
  )

  const colorDept = useCallback((p: Record<string, unknown>) => scaleDept.color(valueOfDept(String(p.code))), [scaleDept, valueOfDept])
  const labelDept = useCallback(
    (p: Record<string, unknown>) => {
      const v = valueOfDept(String(p.code))
      if (ind.kind === 'avis' && v == null && y)
        return `<b>${p.nom}</b> (${p.code})<br>${AVIS_SANS_INFORMATION}${NBSP}: ${resumeSansInformation(String(y), avisNat?.lecture?.[String(p.code)]?.[String(y)]?.[0] ?? 0)}`
      const a = paramAgg.get(String(p.code))
      const extra = isParam && a ? ` · ${fmt.int(a.n)} analyses` : ''
      const r = ind.kind === 'situation' ? situ?.depts[String(p.code)]?.[ind.fam!] : undefined
      const lib = ind.fam ? libellesSituation(ind.fam) : []
      const detail = r
        ? `<br><span class="muted">${fmt.int(r[0] + r[1] + r[2] + r[3])} réseaux : ${r
            .slice(0, nbClasses(ind.fam!))
            .map((x, i) => `${fmt.int(x)} ${lib[i]}`)
            .join(' · ')}</span>`
        : ''
      return `<b>${p.nom}</b> (${p.code})<br>${fmtValue(v)} · ${desc}${extra}${detail}`
    },
    [valueOfDept, fmtValue, desc, isParam, paramAgg, ind, situ, avisNat, y],
  )

  const valueOfCommune = useCallback(
    (row: MapRow | undefined): number | null => {
      if (!row || row[0] === 0) return null
      // niveau de gravité, pas seulement présence ; null : pas d'information (délégation sans information)
      if (ind.kind === 'avis') return row[14] === undefined ? 0 : row[14]
      if (ind.kind === 'situation') return codeFamille(row[15], ind.fam!)
      return ind.key === 'bact' ? (row[2] ? row[1] / row[2] : null) : row[4] ? row[3] / row[4] : null
    },
    [ind],
  )
  const colorCommune = useCallback((p: Record<string, unknown>) => scaleCommune.color(valueOfCommune(map?.[String(p.code)])), [map, valueOfCommune, scaleCommune])
  const labelCommune = useCallback(
    (p: Record<string, unknown>) => {
      const nom = (p.nom as string | undefined) ?? nameOf.get(String(p.code)) ?? String(p.code)
      const row = map?.[String(p.code)]
      if (!row || row[0] === 0) return `<b>${nom}</b><br>pas de prélèvement en ${y}`
      const v = valueOfCommune(row)
      const txt =
        ind.kind === 'avis'
          ? libelleAvisCarte(row[14])
          : ind.kind === 'situation'
            ? v == null
              ? 'famille non analysée'
              : libellesSituation(ind.fam!)[v]
            : fmt.pct(100 * (v ?? 0), 1)
      return `<b>${nom}</b><br>${txt} · ${fmt.int(row[0])} prélèvements`
    },
    [map, valueOfCommune, ind, y, nameOf],
  )

  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps])

  // Paramètres proposés, groupés par famille.
  const paramGroups = useMemo(() => {
    const g = new Map<string, SeriesIndexEntry[]>()
    for (const e of seriesIndex ?? []) g.set(e.f, [...(g.get(e.f) ?? []), e])
    return [...g.entries()]
  }, [seriesIndex])

  // Classement des communes du département affiché : la colonne de droite ne reste pas vide en vue communale.
  const classementCommunes = useMemo(() => {
    if (!vueCommunes || !dept || !map) return []
    return Object.entries(map)
      .filter(([insee]) => deptOfInsee(insee) === dept)
      .map(([insee, row]) => ({ insee, nom: nameOf.get(insee) ?? insee, plv: row[0], v: valueOfCommune(row), dep: ind.col != null ? ((row[ind.col] as number | undefined) ?? 0) : 0 }))
      // Communes dont un réseau est non conforme (nitrates : dès 40 mg/L, classe proche de la limite).
      .filter((c) => c.plv > 0 && c.v != null && (ind.kind !== 'situation' ? c.v > 0 : ind.fam === 'azote' ? c.v >= 2 : classesNonConformes(ind.fam!).includes(c.v)))
      // Situation d'abord (restriction, puis dépassements récurrents…), puis nombre d'analyses au-dessus de la limite.
      .sort((a, b) => (b.v ?? 0) - (a.v ?? 0) || b.dep - a.dep || b.plv - a.plv)
  }, [vueCommunes, dept, map, nameOf, valueOfCommune, ind])

  const classement = useMemo(
    () =>
      [...(isParam ? paramAgg.keys() : deptAgg.keys())]
        .map((d) => ({ d, v: valueOfDept(d) }))
        .filter((r) => r.v != null)
        .sort((a, b) => (b.v ?? 0) - (a.v ?? 0)),
    [isParam, paramAgg, deptAgg, valueOfDept],
  )
  const visibles = tout ? classement : classement.slice(0, 12)
  const communesSansInfo = useMemo(
    () => vueCommunes && ind.kind === 'avis' && !!map && Object.entries(map).some(([insee, r]) => r[14] === null && (!dept || deptOfInsee(insee) === dept)),
    [vueCommunes, ind, map, dept],
  )
  const nbMuets = ind.kind === 'avis' && y ? (avisNat?.sans_information?.[String(y)]?.length ?? 0) : 0
  const deptMuet = ind.kind === 'avis' && !!dept && !!y && departementSansInformation(avisNat, dept, String(y))
  const selection = survol ?? dept

  return (
    <div className="page">
      <p className="eyebrow">Cartes</p>
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
          <select value={indic} onChange={(e) => setQ({ indic: e.target.value, ...(e.target.value === 'param' ? { fond: null } : {}) })}>
            {INDICS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        {isParam && (
          <label>
            Paramètre{' '}
            <select value={param} onChange={(e) => setQ({ param: e.target.value })}>
              {paramGroups.map(([f, list]) => (
                <optgroup key={f} label={params?.familles[f as keyof ParamsFile['familles']] ?? f}>
                  {list.map((e) => (
                    <option key={e.code} value={e.code}>
                      {e.k ?? e.l}
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
        {THEME_OF[indic] && (
          <Link to={`/themes/${THEME_OF[indic]}`} className="btn">
            Voir le thème
          </Link>
        )}
        {dept && (
          // Toute la vue courante (indicateur, paramètre, mesure, millésime) part avec le lien : la fiche
          // département ne fait pas table rase de ce qu'on regardait, et le retour la restitue à l'identique.
          <Link to={`/departement/${dept}?${sp.toString()}`} className="btn" viewTransition>
            Fiche du département
          </Link>
        )}
        {dept && (
          <button className="btn" onClick={() => setQ({ dept: null })}>
            {vueCommunes ? '← France entière' : '✕ Désélectionner'}
          </button>
        )}
        {!dept && !isParam && (
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
          Un paramètre se lit par département : ses analyses ne sont pas publiées commune par commune.{' '}
          <button type="button" className="btn-link" onClick={() => setQ({ indic: indicFamille, ...(dept ? {} : { fond: 'communes' }) })}>
            {dept ? 'Voir ses communes' : 'Voir les communes'} ({INDICS.find((i) => i.key === indicFamille)!.label.toLowerCase()}) →
          </button>
        </p>
      )}
      {/* L'année, au-dessus de ce qu'elle gouverne (règle de l'auteur, 23/09) : la carte et le classement. */}
      <BarreAnnee titre="Année des données" note="Elle vaut pour la carte et le classement des départements." annees={anneesFiche(meta)} annee={y} onChange={setYear} />
      <div className="grid cols-map">
        <div>
          {vueCommunes ? (
            <FranceMap
              key={dept ? `communes-${dept}` : 'communes-france'}
              data={dept ? communes : communesFrance}
              colorOf={colorCommune}
              labelOf={labelCommune}
              onClick={(p) => nav(`/commune/${p.code}`, { viewTransition: true })}
              onHover={dept ? (p) => setSurvolCommune(p ? String(p.code) : null) : undefined}
              selected={dept ? survolCommune : null}
              height={620}
              ariaLabel={dept ? 'Carte des communes du département ; les communes les plus touchées sont listées à côté' : 'Carte de toutes les communes de France'}
            />
          ) : (
            <FranceMap
              key="departements"
              data={deps}
              colorOf={colorDept}
              labelOf={labelDept}
              onClick={(p) => setQ({ dept: String(p.code) })}
              onHover={(p) => setSurvol(p ? String(p.code) : null)}
              selected={selection}
              height={620}
              actionLabel={isParam ? 'Sélectionner ce département →' : 'Voir ses communes →'}
              ariaLabel="Carte des départements ; le classement à côté reprend les valeurs"
            />
          )}
          <MapLegend
            desc={vueCommunes && ind.descCommune ? ind.descCommune : desc}
            scale={vueCommunes ? scaleCommune : scaleDept}
            format={(v) => (ind.kind === 'avis' ? fmt.int(v) : !isParam || mesure === 'share' ? pctBorne(v) : fmtValue(v))}
            binaire={vueCommunes && ind.kind === 'avis' ? ind.binaire : vueCommunes && ind.kind === 'situation' ? libellesSituation(ind.fam!) : undefined}
            premier={!vueCommunes && ind.kind === 'avis' ? 'aucun avis' : undefined}
            noDataLabel={
              vueCommunes ? (communesSansInfo ? `sans prélèvement ou ${AVIS_SANS_INFORMATION}` : 'sans prélèvement') : ind.kind === 'avis' ? AVIS_SANS_INFORMATION : 'sans donnée'
            }
          />
          {isParam && serieState.error && <p className="muted">Pas de série mensuelle pour ce paramètre ({param}).</p>}
          {isParam && (
            <p className="muted">
              Cumul des analyses du millésime par département
              {paramInfo?.lim ? `, limite de qualité ${paramInfo.lim}` : paramInfo?.ref ? `, référence de qualité ${paramInfo.ref}, pas de limite` : ''}.
            </p>
          )}
        </div>
        <div className="card">
          <h3>Trouver une commune</h3>
          <Search />
          <p className="muted">
            {isParam
              ? 'Cliquez un département pour le sélectionner, puis « Fiche du département » pour l’ouvrir.'
              : vueCommunes
                ? 'Cliquez une commune pour ouvrir sa fiche.'
                : 'Cliquez un département pour afficher ses communes, puis une commune pour ouvrir sa fiche.'}
          </p>
          {vueCommunes && dept && (
            <>
              <h3>Communes concernées{classementCommunes.length ? ` (${classementCommunes.length})` : ''}</h3>
              {classementCommunes.length === 0 ? (
                <p className="muted">
                  {deptMuet
                    ? phraseCarteSansInformation(String(y), avisNat?.lecture?.[dept]?.[String(y)]?.[0] ?? 0)
                    : `Aucune commune du département n'est concernée par cet indicateur en ${y}.`}
                </p>
              ) : (
                <div className="table-scroll"><table className="data">
                  <caption className="sr-only">Communes concernées, version textuelle de la carte</caption>
                  <thead>
                    <tr>
                      <th>Commune</th>
                      {ind.kind === 'taux' ? (
                        <th className="num">Non conformes</th>
                      ) : ind.kind === 'avis' ? (
                        <th>Avis</th>
                      ) : (
                        <>
                          <th>Situation</th>
                          <th className="num">Analyses au-dessus</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(tout ? classementCommunes : classementCommunes.slice(0, 15)).map((c) => (
                      <tr
                        key={c.insee}
                        className={survolCommune === c.insee ? 'on' : undefined}
                        onMouseEnter={() => setSurvolCommune(c.insee)}
                        onMouseLeave={() => setSurvolCommune(null)}
                      >
                        <td>
                          {/* Lien, pas juste un clic sur la ligne : la légende annonce ce tableau comme l'équivalent
                              textuel de la carte, elle-même non navigable au clavier (FranceMap.tsx). */}
                          <Link to={`/commune/${c.insee}`}>{c.nom}</Link>
                        </td>
                        {ind.kind === 'taux' ? (
                          <td className="num">{fmt.pct(100 * (c.v ?? 0), 1)}</td>
                        ) : ind.kind === 'avis' ? (
                          <td>{AVIS_PAR_CODE[c.dep]}</td>
                        ) : (
                          <>
                            <td>
                              <span className="swatch" style={{ background: situationScale(ind.fam!).color(c.v) }} aria-hidden="true" /> {c.v != null ? libellesCourts(ind.fam!)[c.v] : '–'}
                            </td>
                            <td className="num">{fmt.int(c.dep)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
              {classementCommunes.length > 15 && (
                <p className="muted">
                  {tout ? `${classementCommunes.length} communes` : `15 premières sur ${classementCommunes.length}`}{' '}
                  <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
                    {tout ? 'voir les 15 premières' : 'voir toutes les communes'}
                  </button>
                </p>
              )}
            </>
          )}
          {!vueCommunes && classement.length > 0 && (
            <>
              <h3>Départements les plus touchés</h3>
              <div className="table-scroll"><table className="data">
                <caption className="sr-only">Départements classés par valeur décroissante de l'indicateur choisi ; version textuelle de la carte</caption>
                <thead>
                  <tr>
                    <th>Département</th>
                    <th className="num">
                      {isParam ? { share: 'Part au-dessus', nd: 'Analyses au-dessus', max: 'Maximum' }[mesure] : ind.kind === 'taux' ? 'Prélèvements non conformes' : ind.kind === 'avis' ? 'Communes avec un avis' : 'Réseaux non conformes'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => (
                    <tr key={r.d} className={selection === r.d ? 'on' : undefined} onMouseEnter={() => setSurvol(r.d)} onMouseLeave={() => setSurvol(null)}>
                      <td>
                        <Link to={`?${deptHref(r.d)}`}>{deptName.get(r.d) ?? r.d}</Link>
                      </td>
                      <td className="num">{fmtValue(r.v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="muted">
                {tout ? `${classement.length} départements avec une valeur` : `12 premiers sur ${classement.length} départements avec une valeur`}{' '}
                <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
                  {tout ? 'voir les 12 premiers' : 'voir tout le classement'}
                </button>
              </p>
              {nbMuets > 0 && (
                <p className="muted">
                  Pas d’information en {y} dans {fmt.nb(nbMuets, 'département')}, en gris sur la carte{NBSP}: aucune conclusion de l’ARS n’y évoque de consigne, ni
                  pour en prescrire une, ni pour l’écarter. <Link to={`/avis?annee=${y}`}>Liste et méthode</Link>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <div className="source">Source : contrôle sanitaire SISE-Eaux (ministère de la Santé). Contours : Etalab / IGN Admin Express.</div>
    </div>
  )
}

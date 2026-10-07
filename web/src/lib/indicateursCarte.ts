import { pctCarte, pctRestrictions } from './carte'
import { fmt } from './data'
import { INDICS_COMMUNES, type IndicateurCommune, type IndicCommuneKey } from './indicateursCommunes'
import { libelleClasse, libellesSituation, nbClasses, reseauxAnalyses, type FamilleSitu, type Repartition } from './situations'
import { AVIS_SANS_INFORMATION, deptCode, deptOfInsee, type MapFile, type SeriesFile } from './types'

export type IndicKey = 'classes' | IndicCommuneKey | 'bact' | 'chim' | 'param'
export type Mesure = 'share' | 'nd' | 'max'

/**
 * Indicateurs de la carte (revue du 2026-09-22, décisions de l'auteur) :
 *  · `situation` : part des RÉSEAUX de distribution non conformes, à la manière des bilans du ministère de la
 *    Santé (lib/situations.ts) ; en vue communale, situation du réseau le plus défavorable qui dessert la
 *    commune. Ni part de communes ni part d'habitants : une commune n'est pas touchée en entier parce qu'une
 *    analyse a dépassé la limite, et la population de chaque réseau n'est pas publiée ;
 *  · `restriction` : part des réseaux sous restriction de consommation ou consigne d'ébullition de l'ARS
 *    (demande de l'auteur, 24/09 : les restrictions n'avaient pas d'entrée à elles) ; en vue communale, commune
 *    desservie par un tel réseau, avec les familles en cause ;
 *  · `avis` : nombre de communes ayant reçu une consigne de l'ARS (une consigne vise bien les habitants) ;
 *  · `taux` : part des prélèvements non conformes, comme les bilans bactériologiques des ARS ;
 *  · `classes` (refonte, lot 3, 2026-10-05, en tête du menu) : part des réseaux classés C ou D, classes A–D calculées
 *    par le site selon la méthode de l'indicateur de l'ARS (lib/france.ts) ; en vue communale, lettre la plus
 *    défavorable des réseaux qui desservent la commune, pour un département à la fois (réseaux des communes lus dans
 *    dept/<dd>.json, que la France entière ne peut pas charger d'un coup).
 * La vue communale des trois premiers vient de lib/indicateursCommunes.ts, partagée avec la fiche département.
 */
export interface IndicCarte {
  key: IndicKey
  label: string
  kind: IndicateurCommune['kind'] | 'taux' | 'param' | 'classes'
  fam?: FamilleSitu
  desc: string
  descCommune?: string
  theme?: string | null
}

/** Légendes départementales des indicateurs qui ont une vue communale. */
const DESC: Record<IndicCommuneKey, Pick<IndicCarte, 'desc'>> = {
  pesticides: { desc: 'part des réseaux non conformes, c’est-à-dire dont au moins une analyse de pesticides a dépassé la limite de qualité dans l’année (0,1 µg/L pour la plupart des substances)' },
  azote: { desc: 'part des réseaux non conformes, c’est-à-dire dont au moins une analyse de nitrates a dépassé 50 mg/L dans l’année' },
  pfas: { desc: 'part des réseaux non conformes, c’est-à-dire dont la somme des 20 PFAS a dépassé 0,1 µg/L au moins une fois dans l’année' },
  microbio: { desc: 'part des réseaux à plus de 5 % de prélèvements non conformes en bactériologie, ou sous consigne de l’ARS' },
  metaux: { desc: 'part des réseaux non conformes, c’est-à-dire dont au moins une analyse de métaux ou de minéraux a dépassé la limite de qualité dans l’année' },
  autres: {
    desc: 'part des réseaux non conformes, c’est-à-dire dont au moins une analyse d’un autre paramètre soumis à une limite de qualité (sous-produits de la désinfection, chlorure de vinyle, solvants, hydrocarbures aromatiques polycycliques, turbidité) a dépassé cette limite dans l’année',
  },
  any: { desc: 'part des réseaux non conformes pour au moins une famille de paramètres' },
  restrictions: { desc: "part des réseaux sous restriction de consommation ou consigne d'ébullition de l'ARS au moins une fois dans l'année" },
  avis: { desc: "nombre de communes ayant reçu au moins une restriction ou une recommandation de consommation de l'ARS" },
}

export const INDICS: readonly IndicCarte[] = [
  {
    key: 'classes',
    label: 'Notes A–D (calculées par le site)',
    kind: 'classes',
    theme: null,
    desc: 'part des réseaux notés C ou D, notes calculées par le site selon la méthode de l’indicateur de l’ARS',
    descCommune: 'note la plus défavorable des réseaux qui desservent la commune (notes calculées par le site)',
  },
  ...INDICS_COMMUNES.map((i) => ({ ...i, ...DESC[i.key] })),
  // Libellés distincts de « Bactériologie » (famille, en réseaux) : ceux-ci comptent des prélèvements (relecture du 24/09).
  { key: 'bact', label: 'Bactériologie : prélèvements non conformes', kind: 'taux', theme: 'bacteries', desc: 'part des prélèvements non conformes (bactériologie)' },
  { key: 'chim', label: 'Chimie : prélèvements non conformes', kind: 'taux', desc: 'part des prélèvements non conformes (chimie)' },
  { key: 'param', label: 'Un paramètre au choix…', kind: 'param', desc: 'valeur par département pour le paramètre choisi' },
]
export const MESURES: { key: Mesure; label: string }[] = [
  { key: 'share', label: 'part des analyses au-dessus de la limite' },
  { key: 'nd', label: "nombre d'analyses au-dessus de la limite" },
  { key: 'max', label: 'valeur maximale mesurée' },
]

/** Page qui développe un indicateur sans thème : les restrictions et les avis ont celle des avis de l'ARS. */
export const PAGE_OF: Partial<Record<IndicKey, { to: string; label: string }>> = {
  restrictions: { to: '/avis', label: "Voir les avis de l'ARS" },
  avis: { to: '/avis', label: "Voir les avis de l'ARS" },
}
/**
 * Indicateur de famille d'un paramètre, pour revenir au niveau communal (revue du 24/09 : « la vue communes
 * n'est pas accessible », en mode paramètre, sans explication) : un paramètre ne se lit que par département,
 * une commune n'a de situation que par famille. Les familles sans indicateur sur la carte (physico-chimie,
 * radioactivité…) mènent à « Toutes familles ».
 */
export const FAMILLE_DU_PARAM: Partial<Record<string, IndicKey>> = { pesticides: 'pesticides', azote: 'azote', pfas: 'pfas', microbio: 'microbio', metaux_mineraux: 'metaux', autres: 'autres' }
/** Nombre de communes ayant reçu un avis de l'ARS dans l'année (médiane départementale : 25). */
export const STEPS_AVIS = [0, 1, 5, 10, 25, 50, 100]
/**
 * Paliers des taux de non-conformité : médiane départementale vers 0,4 % en bactériologie. Sur les
 * paliers des parts de communes (0-5-10… %), 93 départements sur 101 avaient la même teinte.
 */
export const STEPS_TAUX = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1]

/** Indicateur qui a une vue communale au sens de lib/indicateursCommunes.ts (situation, restriction, avis). */
export function aVueCommunale(ind: IndicCarte): ind is IndicCarte & { kind: IndicateurCommune['kind'] } {
  return ind.kind === 'situation' || ind.kind === 'restriction' || ind.kind === 'avis'
}

/** Cumuls d'un département (MapRow) : communes avec prélèvement, communes ayant reçu un avis, prélèvements évalués. */
export type DeptAgg = { n: number; hit: number; ncb: number; neb: number; ncc: number; nec: number }
/** Cumuls de l'année d'un paramètre dans un département : analyses, analyses au-dessus de la limite, maximum. */
export type ParamAgg = { n: number; nd: number; max: number | null }

/**
 * Cumuls par département du fichier de carte. Saint-Martin et Saint-Barthélemy figurent dans le contrôle sanitaire mais
 * ne sont pas des départements : sans contour (`avecContour`, ignoré tant qu'il est vide), ils n'entrent pas au classement.
 */
export function agregerDepartements(map: MapFile | null | undefined, avecContour: ReadonlySet<string>): Map<string, DeptAgg> {
  const agg = new Map<string, DeptAgg>()
  if (!map) return agg
  for (const [insee, row] of Object.entries(map)) {
    const d = deptOfInsee(insee)
    if (avecContour.size && !avecContour.has(d)) continue
    const a = agg.get(d) ?? { n: 0, hit: 0, ncb: 0, neb: 0, ncc: 0, nec: 0 }
    if (row[0] > 0) {
      a.n++
      // Communes ayant reçu un avis de l'ARS (MapRow[14]), lues pour l'indicateur des avis.
      if ((row[14] ?? 0) > 0) a.hit++
    }
    a.ncb += row[1]
    a.neb += row[2]
    a.ncc += row[3]
    a.nec += row[4]
    agg.set(d, a)
  }
  return agg
}

/** Mode paramètre : les mois de l'année cumulés dans la série départementale du paramètre. */
export function agregerParametre(serie: SeriesFile | null | undefined, annee: number | undefined): Map<string, ParamAgg> {
  const agg = new Map<string, ParamAgg>()
  if (!serie || !annee) return agg
  const months = serie.mois.map((m, i) => (m.startsWith(`${annee}-`) ? i : -1)).filter((i) => i >= 0)
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
}

/** Valeur d'un département pour la mesure choisie d'un paramètre. */
export function valeurParametre(a: ParamAgg, mesure: Mesure): number | null {
  return mesure === 'share' ? a.nd / a.n : mesure === 'nd' ? a.nd : a.max
}

/** Valeur d'un département écrite dans l'info-bulle et le classement ; `mesure` en mode paramètre, null sinon. */
export function formaterValeur(ind: IndicCarte, v: number | null, mesure: Mesure | null, unite: string | null | undefined): string {
  if (v == null) return ind.kind === 'avis' ? AVIS_SANS_INFORMATION : ind.kind === 'restriction' ? `pas de donnée ou ${AVIS_SANS_INFORMATION}` : 'pas de donnée'
  if (ind.kind === 'avis') return `${fmt.int(v)} commune${v > 1 ? 's' : ''}`
  // Une part de réseaux s'écrit sans franchir une borne de la légende (lib/carte.ts).
  if (ind.kind === 'situation' || ind.kind === 'classes') return pctCarte(v)
  if (ind.kind === 'restriction') return v === 0 ? 'aucun réseau' : pctRestrictions(v)
  if (mesure == null || mesure === 'share') return fmt.pct(100 * v, v < 0.1 ? 1 : 0)
  if (mesure === 'nd') return fmt.int(v)
  // Zéro s'écrit « 0 » : la borne basse de la légende affichait « 0,000 mg/L ».
  return `${v === 0 ? '0' : fmt.dec(v, v >= 10 ? 1 : v >= 1 ? 2 : 3)} ${unite ?? ''}`
}

/** Titre de la colonne des valeurs du classement des départements ; `mesure` en mode paramètre, null sinon. */
export function enteteClassement(ind: IndicCarte, mesure: Mesure | null): string {
  if (mesure != null) return { share: 'Part au-dessus', nd: 'Analyses au-dessus', max: 'Maximum' }[mesure]
  if (ind.kind === 'taux') return 'Prélèvements non conformes'
  if (ind.kind === 'avis') return 'Communes avec un avis'
  if (ind.kind === 'restriction') return 'Réseaux sous restriction'
  if (ind.kind === 'classes') return 'Réseaux notés C ou D'
  return 'Réseaux non conformes'
}

/** Détail de l'info-bulle d'un département : répartition de ses réseaux par classe, ou réseaux sous restriction. */
export function detailDepartement(ind: IndicCarte, situ: Partial<Record<FamilleSitu, Repartition>> | undefined, annee: number | undefined): string {
  const r = ind.kind === 'situation' ? situ?.[ind.fam!] : undefined
  if (r) {
    const lib = libellesSituation(ind.fam!).map((_, i) => libelleClasse(ind.fam!, i, annee))
    return `<br><span class="muted">${fmt.int(reseauxAnalyses(r))} réseaux : ${r
      .slice(0, nbClasses(ind.fam!))
      .map((x, i) => `${fmt.int(x)} ${lib[i]}`)
      .join(' · ')}</span>`
  }
  const rt = ind.kind === 'restriction' ? situ?.toutes : undefined
  return rt ? `<br><span class="muted">${fmt.int(rt[2])} sur ${fmt.int(reseauxAnalyses(rt))} réseaux analysés</span>` : ''
}

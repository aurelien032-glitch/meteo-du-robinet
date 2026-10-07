import { fmt } from './data'
import { deDepartements } from './departements'
import type { Ton } from './situations'
import { AVIS_CODE, deptCode, type AvisCat, type AvisDeptFile, type LectureAvis } from './types'

/**
 * Avis sanitaires de l'ARS, lus dans les conclusions des prélèvements (pipeline/robinet/avis.py). Dans un fichier
 * avis/<dd>.json, chaque commune porte ses lignes [date du prélèvement, id de formulation, réseau], dédoublonnées :
 * un avis sur un réseau figure dans toutes les communes qu'il dessert cette année-là. Deux prélèvements du même
 * jour, sur le même réseau et avec la même conclusion, n'y font qu'une ligne.
 */

export type LigneAvis = AvisDeptFile['communes'][string][number]
type Textes = AvisDeptFile['textes']

/** Avis d'une année regroupés par formulation : une ligne par avis, avec sa période. */
export interface GroupeAvis {
  id: number
  /** conclusion de l'ARS, espaces multiples réduits */
  texte: string
  cat: AvisCat
  /** limité à un bâtiment, un point d'usage ou au seul point de prélèvement */
  local: boolean
  /** causes lues dans le texte (« PFAS », « bactériologie »…) */
  causes: string[]
  debut: string
  fin: string
  /** prélèvements concernés (lignes du fichier) */
  n: number
  reseaux: string[]
  /** suite de l'avis, pour l'année en cours seulement (groupesAvis reçoit alors les derniers prélèvements) */
  suite?: SuiteAvis | null
}

/**
 * Avis d'une année, un groupe par formulation : les avis généraux avant ceux limités à un bâtiment, le plus grave
 * d'abord, puis le plus récent. Une formulation sans texte est écartée. Avec `derniers` (année en cours), chaque avis
 * général reçoit sa suite.
 */
export function groupesAvis(lignes: readonly LigneAvis[], textes: Textes, annee: string, derniers?: Record<string, string>): GroupeAvis[] {
  const groupes = new Map<number, GroupeAvis>()
  for (const [d, id, r] of lignes) {
    const x = textes[String(id)]
    if (!d.startsWith(annee) || !x?.t) continue
    const g = groupes.get(id) ?? { id, texte: x.t.replace(/\s{2,}/g, ' '), cat: x.c, local: x.l, causes: x.k, debut: d, fin: d, n: 0, reseaux: [] }
    if (d < g.debut) g.debut = d
    if (d > g.fin) g.fin = d
    g.n++
    if (!g.reseaux.includes(r)) g.reseaux.push(r)
    groupes.set(id, g)
  }
  const liste = [...groupes.values()]
  if (derniers) for (const g of liste) if (!g.local) g.suite = suiteAvis(lignes, textes, derniers, g.cat, annee, g.reseaux)
  return liste.sort((a, b) => Number(a.local) - Number(b.local) || AVIS_CODE[b.cat] - AVIS_CODE[a.cat] || b.fin.localeCompare(a.fin))
}

/**
 * Suite d'un avis de l'année en cours (choix de l'auteur, 25/09) : le dernier prélèvement conclu connu d'un réseau qui le
 * porte le reprend-il encore, ou ne le mentionne-t-il plus ? Des faits datés, jamais « en vigueur » : l'ARS ne publie pas
 * la levée d'une consigne, et les données s'arrêtent à la dernière publication mensuelle.
 */
export interface SuiteAvis {
  /** repris au dernier prélèvement connu d'au moins un des réseaux qui le portent */
  reprise: boolean
  /** ce dernier prélèvement ; sinon, le plus récent des réseaux concernés */
  date: string
  /** réseaux concernés, dont le dernier prélèvement est connu */
  reseaux: number
}

/**
 * Suite d'une catégorie d'avis sur les réseaux qui la portent (ou sur `reseaux` seulement), par catégorie et non par
 * formulation : une même restriction change de texte d'un prélèvement à l'autre (Meuse, 2026 : l'arrêté PFAS sous deux
 * formulations). null sans dernier prélèvement connu (fichier antérieur au 25/09).
 */
export function suiteAvis(
  lignes: readonly LigneAvis[],
  textes: Textes,
  derniers: Record<string, string> | undefined,
  cat: AvisCat,
  annee: string,
  reseaux?: readonly string[],
): SuiteAvis | null {
  if (!derniers) return null
  const dernierAvis = new Map<string, string>()
  for (const [d, id, r] of lignes) {
    const x = textes[String(id)]
    if (!d.startsWith(annee) || !x?.t || x.l || x.c !== cat || (reseaux && !reseaux.includes(r))) continue
    if (d > (dernierAvis.get(r) ?? '')) dernierAvis.set(r, d)
  }
  let reprise = ''
  let absent = ''
  let n = 0
  for (const [r, d] of dernierAvis) {
    const dernier = derniers[r]
    if (!dernier) continue
    n++
    if (d >= dernier) reprise = dernier > reprise ? dernier : reprise
    else absent = dernier > absent ? dernier : absent
  }
  if (!n) return null
  return { reprise: reprise !== '', date: reprise || absent, reseaux: n }
}

/**
 * Suite d'un avis, après sa période (`debut`, `fin`), sans en répéter la date : « au dernier prélèvement connu du
 * réseau » (un seul prélèvement, le dernier connu), « avis repris jusqu’au dernier prélèvement connu du réseau » (période
 * qui s'y achève), « avis repris au dernier prélèvement connu du réseau, le 08/06/2026 » (sous une autre formulation, ou
 * sur un autre réseau), « avis absent des prélèvements suivants du réseau, jusqu’au 23/07/2026 ».
 */
export function phraseSuite(s: SuiteAvis, debut: string, fin: string): string {
  const reseau = s.reseaux > 1 ? 'de l’un des réseaux' : 'du réseau'
  if (!s.reprise) return `avis absent des prélèvements suivants ${s.reseaux > 1 ? 'des réseaux concernés' : 'du réseau'}, jusqu’au ${fmt.date(s.date)}`
  if (s.date !== fin) return `avis repris au dernier prélèvement connu ${reseau}, le ${fmt.date(s.date)}`
  return debut === fin ? `au dernier prélèvement connu ${reseau}` : `avis repris jusqu’au dernier prélèvement connu ${reseau}`
}

/** Une catégorie d'avis de l'année en cours dans le bandeau : sa période et sa suite. */
export interface CategorieEnCours {
  cat: AvisCat
  debut: string
  fin: string
  suite: SuiteAvis | null
}

/**
 * Avis de l'année en cours, pour le bandeau en tête de fiche (choix de l'auteur, 25/09) : une ligne par catégorie, de la
 * plus grave à la moins grave, chacune avec SA période (le bandeau datait autrefois la plus grave d'un autre avis) et sa
 * suite. Ton du plus grave encore repris au dernier prélèvement connu, suite inconnue comprise ; neutre si aucun ne l'est.
 * Les avis limités à un bâtiment n'y entrent pas ; null sans avis.
 */
export function avisEnCours(
  lignes: readonly LigneAvis[],
  textes: Textes,
  anneeEnCours: string,
  derniers?: Record<string, string>,
): { categories: CategorieEnCours[]; ton: Exclude<Ton, 'good'> | null } | null {
  const parCat = new Map<AvisCat, CategorieEnCours>()
  for (const [d, id] of lignes) {
    const x = textes[String(id)]
    if (!d.startsWith(anneeEnCours) || !x?.t || x.l) continue
    const c = parCat.get(x.c) ?? { cat: x.c, debut: d, fin: d, suite: null }
    if (d < c.debut) c.debut = d
    if (d > c.fin) c.fin = d
    parCat.set(x.c, c)
  }
  if (!parCat.size) return null
  const categories = [...parCat.values()].sort((a, b) => AVIS_CODE[b.cat] - AVIS_CODE[a.cat])
  for (const c of categories) c.suite = suiteAvis(lignes, textes, derniers, c.cat, anneeEnCours)
  const repris = categories.find((c) => c.suite?.reprise !== false)
  return { categories, ton: repris ? toneAvis(repris.cat) : null }
}

/**
 * Lignes d'avis d'un réseau, réunies depuis les communes qu'il dessert et dédoublonnées, de la plus récente à la
 * plus ancienne. Un fichier ne couvre qu'un département : une année où le réseau n'y desservait aucune commune,
 * ses avis n'y figurent pas.
 */
export function avisDuReseau(communes: AvisDeptFile['communes'], cdreseau: string): LigneAvis[] {
  const vues = new Map<string, LigneAvis>()
  for (const lignes of Object.values(communes)) for (const l of lignes) if (l[2] === cdreseau) vues.set(`${l[0]}|${l[1]}`, l)
  return [...vues.values()].sort((a, b) => b[0].localeCompare(a[0]) || b[1] - a[1])
}

/**
 * Ton du voyant d'un avis, jugement sanitaire de l'ARS : publics sensibles en orange, consigne d'ébullition et
 * restriction en rouge. Un avis limité à un bâtiment, un point d'usage ou au seul point de prélèvement reste neutre (null).
 */
export function toneAvis(cat: AvisCat, local = false): Exclude<Ton, 'good'> | null {
  if (local) return null
  return cat === 'sensibles' ? 'warn' : 'bad'
}

/**
 * Ton de l'étiquette d'un code d'avis de la carte des communes (MapRow[14] : 1 publics sensibles, 2 ébullition,
 * 3 restriction), celui de sa catégorie (toneAvis) ; null pour « aucun avis ». Listes des communes de la fiche
 * département et de /carte.
 */
export function toneAvisCode(code: number): Exclude<Ton, 'good'> | null {
  const cat = (Object.keys(AVIS_CODE) as AvisCat[]).find((c) => AVIS_CODE[c] === code)
  return cat ? toneAvis(cat) : null
}

/** Ton d'un avis de l'année en cours : neutre aussi quand il est absent des prélèvements suivants (choix de l'auteur, 25/09). */
export function toneAvisSuivi(cat: AvisCat, local: boolean, suite: SuiteAvis | null | undefined): Exclude<Ton, 'good'> | null {
  return toneAvis(cat, local || suite?.reprise === false)
}

/** Période d'un avis : « le 16/09/2025 » ou « du 05/08/2025 au 21/08/2025 ». */
export function periode(debut: string, fin: string): string {
  return debut === fin ? `le ${fmt.date(debut)}` : `du ${fmt.date(debut)} au ${fmt.date(fin)}`
}

/*
 * Délégations « sans information » (constat du 24/09) : dans certains départements, aucune conclusion de l'ARS de l'année
 * n'évoque de consigne, ni pour la prescrire, ni pour l'écarter (Isère : aucune sur 8 234 en 2025, malgré des centaines de
 * prélèvements non conformes). L'absence d'avis n'y dit rien : le site écrit « pas d'information », jamais « aucun avis ».
 * La règle est celle du pipeline (avis.sans_information), lue dans `sans_information` ; les comptes, dans `lecture`.
 */

/** Délégation de l'ARS qui suit un réseau : le département de son code (« 038000123 » → « 38 »), celui de ses prélèvements. */
export function delegation(cdreseau: string): string {
  return deptCode(cdreseau.slice(0, 3))
}

/**
 * Délégations « sans information » l'année donnée parmi celles qui suivent ces réseaux, et le total de leurs conclusions de
 * l'année ; null si toutes renseignent (ou fichier d'un format antérieur, sans `sans_information`).
 */
export function sansInformation(l: LectureAvis, reseaux: readonly string[], annee: string): { delegations: string[]; conclusions: number } | null {
  const muettes = new Set(l.sans_information?.[annee] ?? [])
  const delegations = [...new Set(reseaux.map(delegation))].filter((d) => muettes.has(d)).sort()
  if (!delegations.length) return null
  return { delegations, conclusions: delegations.reduce((s, d) => s + (l.lecture?.[d]?.[annee]?.[0] ?? 0), 0) }
}

/** Prop `sansInfo` du bulletin : conclusions des délégations muettes qui suivent ces réseaux, nommées « de l’Isère ». */
export function sansInfoBulletin(
  l: LectureAvis | null | undefined,
  reseaux: readonly string[],
  annee: string,
  nom: (dd: string) => string,
): { conclusions: number; lieux: string } | null {
  const s = l ? sansInformation(l, reseaux, annee) : null
  return s && { conclusions: s.conclusions, lieux: deDepartements(s.delegations, nom) }
}

/** Le département est-il « sans information » l'année donnée ? */
export function departementSansInformation(l: LectureAvis | null | undefined, dd: string, annee: string): boolean {
  return l?.sans_information?.[annee]?.includes(dd) ?? false
}

/** « aucune des 8 234 conclusions de l’ARS{suite} n’évoque de consigne » ; une seule conclusion : « la seule … n’évoque pas ». */
function aucune(conclusions: number, suite: string): string {
  return conclusions === 1
    ? `la seule conclusion de l’ARS${suite} n’évoque pas de consigne`
    : `aucune des ${fmt.int(conclusions)} conclusions de l’ARS${suite} n’évoque de consigne`
}

/**
 * Phrase du bulletin (maquette validée par l'auteur le 24/09, registre repris le 27/09), après « Pas d'information sur les
 * consignes. » : « En 2025, aucune des 8 234 conclusions de l’ARS sur les réseaux de l’Isère n’évoque de consigne, ni pour en
 * prescrire une, ni pour l’écarter. L’absence d’avis ne permet donc pas de conclure à l’absence de consigne. La mairie et
 * l’ARS font foi. » `lieux` : « de l’Isère » (lib/departements).
 */
export function phraseSansInformation(annee: string, conclusions: number, lieux: string): string {
  return `En ${annee}, ${aucune(conclusions, ` sur les réseaux ${lieux}`)}, ni pour en prescrire une, ni pour l’écarter. L’absence d’avis ne permet donc pas de conclure à l’absence de consigne. La mairie et l’ARS font foi.`
}

/** Forme courte, pour une infobulle ou un tableau : « aucune des 8 234 conclusions de l’ARS n’évoque de consigne en 2025 ». */
export function resumeSansInformation(annee: string, conclusions: number): string {
  return `${aucune(conclusions, '')} en ${annee}`
}

/** Classement vide d'une carte des communes (/carte, fiche département) dans un département sans information. */
export function phraseCarteSansInformation(annee: string, conclusions: number): string {
  return `Pas d’information sur les consignes. En ${annee}, ${aucune(conclusions, '')}, ni pour en prescrire une, ni pour l’écarter. La mairie et l’ARS font foi.`
}

/**
 * Réseaux ayant fait l'objet, dans l'année, d'une restriction de consommation (catégorie `interdiction`) ou d'une
 * consigne d'ébullition, d'après les conclusions de l'ARS d'un fichier départemental (avis/<dd>.json), hors avis
 * limités à un bâtiment ou à un point d'usage : les mêmes comptes que `annees` d'avis/national.json, pour un département.
 */
export function reseauxConsignes(f: AvisDeptFile | null | undefined, annee: string): { restriction: number; ebullition: number } | null {
  if (!f) return null
  const restriction = new Set<string>()
  const ebullition = new Set<string>()
  for (const lignes of Object.values(f.communes))
    for (const [date, id, reseau] of lignes) {
      if (!date.startsWith(annee)) continue
      const t = f.textes[String(id)]
      if (!t || t.l) continue
      if (t.c === 'interdiction') restriction.add(reseau)
      else if (t.c === 'ebullition') ebullition.add(reseau)
    }
  return { restriction: restriction.size, ebullition: ebullition.size }
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Date en toutes lettres : « 5 janvier 2026 », « 1er juillet 2026 » ; sans l'année quand `sansAnnee`. */
export function dateLongue(iso: string, sansAnnee = false): string {
  const jour = Number(iso.slice(8, 10))
  return `${jour === 1 ? '1er' : jour}\u00a0${MOIS[Number(iso.slice(5, 7)) - 1]}${sansAnnee ? '' : `\u00a0${iso.slice(0, 4)}`}`
}

/** Période en toutes lettres : « du 5 janvier au 17 juillet 2026 », « le 17 juillet 2026 ». */
export function periodeLongue(debut: string, fin: string): string {
  if (debut === fin) return `le ${dateLongue(fin)}`
  return `du ${dateLongue(debut, debut.slice(0, 4) === fin.slice(0, 4))} au ${dateLongue(fin)}`
}

/**
 * Publics auxquels l'ARS déconseille l'eau, lus dans les textes de ses conclusions (avis « publics sensibles ») :
 * « nourrissons de moins de 6 mois », « femmes enceintes »…, dans un ordre fixe ; vide quand aucun texte n'en nomme.
 * Les textes de SISE coupent parfois les mots (« nourris sons », « femmes enceint es ») : la lecture se fait sans les
 * espaces (ligne de la carte « Qualité de l'eau », maquette du 2026-10-06).
 */
export function publicsAvis(textes: readonly string[]): string[] {
  const c = textes.map((t) => t.toLowerCase().replace(/\s+/g, '')).join('|')
  const out: string[] = []
  const nourrissons = c.match(/nourrissonsdemoinsde(\d+)mois/)
  if (nourrissons) out.push(`nourrissons de moins de ${nourrissons[1]} mois`)
  else if (c.includes('nourrisson')) out.push('nourrissons')
  const enfants = c.match(/enfantsdemoinsde(\d+)ans/)
  if (enfants) out.push(`enfants de moins de ${enfants[1]} ans`)
  else if (c.includes('enfantsenbasâge') || c.includes('jeunesenfants')) out.push('jeunes enfants')
  if (/femmes?enceintes?/.test(c)) out.push('femmes enceintes')
  if (/allaitent|allaitantes/.test(c)) out.push('femmes qui allaitent')
  if (c.includes('immunod')) out.push('personnes immunodéprimées')
  if (c.includes('personnesâgées')) out.push('personnes âgées')
  if (c.includes('dialys')) out.push('personnes dialysées')
  return out
}

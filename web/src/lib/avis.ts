import { fmt } from './data'
import { deDepartements } from './departements'
import { NBSP } from './instruments'
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
}

/**
 * Avis d'une année, un groupe par formulation : les avis généraux avant ceux limités à un bâtiment, le plus grave
 * d'abord, puis le plus récent. Une formulation sans texte est écartée.
 */
export function groupesAvis(lignes: readonly LigneAvis[], textes: Textes, annee: string): GroupeAvis[] {
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
  return [...groupes.values()].sort((a, b) => Number(a.local) - Number(b.local) || AVIS_CODE[b.cat] - AVIS_CODE[a.cat] || b.fin.localeCompare(a.fin))
}

/** Autres années où figurent des avis, de la plus récente à la plus ancienne. */
export function autresAnnees(lignes: readonly LigneAvis[], annee: string): string[] {
  return [...new Set(lignes.map(([d]) => d.slice(0, 4)).filter((a) => a !== annee))].sort().reverse()
}

/**
 * Avis de l'année en cours, pour le bandeau en tête de fiche : catégories du plus grave au moins grave, date du
 * dernier prélèvement concerné. Les avis limités à un bâtiment n'y entrent pas ; null sans avis.
 */
export function avisEnCours(lignes: readonly LigneAvis[], textes: Textes, anneeEnCours: string): { pire: AvisCat; autres: AvisCat[]; dernier: string } | null {
  const retenues = lignes.filter(([d, id]) => d.startsWith(anneeEnCours) && textes[String(id)]?.t && !textes[String(id)].l)
  if (!retenues.length) return null
  const categories = [...new Set(retenues.map(([, id]) => textes[String(id)].c))].sort((a, b) => AVIS_CODE[b] - AVIS_CODE[a])
  const dernier = retenues.reduce((m, [d]) => (d > m ? d : m), retenues[0][0])
  return { pire: categories[0], autres: categories.slice(1), dernier }
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
 * Phrase du bulletin (maquette validée par l'auteur le 24/09), après « Pas d'information sur les consignes. » : « En 2025,
 * aucune des 8 234 conclusions de l’ARS sur les réseaux de l’Isère n’évoque de consigne, ni pour en prescrire une, ni pour
 * l’écarter : l’absence d’avis ne dit donc rien ici. La mairie et l’ARS font foi. » `lieux` : « de l’Isère » (lib/departements).
 */
export function phraseSansInformation(annee: string, conclusions: number, lieux: string): string {
  return `En ${annee}, ${aucune(conclusions, ` sur les réseaux ${lieux}`)}, ni pour en prescrire une, ni pour l’écarter${NBSP}: l’absence d’avis ne dit donc rien ici. La mairie et l’ARS font foi.`
}

/** Forme courte, pour une infobulle ou un tableau : « aucune des 8 234 conclusions de l’ARS n’évoque de consigne en 2025 ». */
export function resumeSansInformation(annee: string, conclusions: number): string {
  return `${aucune(conclusions, '')} en ${annee}`
}

/** Classement vide d'une carte des communes (/carte, fiche département) dans un département sans information. */
export function phraseCarteSansInformation(annee: string, conclusions: number): string {
  return `Pas d’information${NBSP}: ${resumeSansInformation(annee, conclusions)}, ni pour en prescrire une, ni pour l’écarter. La mairie et l’ARS font foi.`
}

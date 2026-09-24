import { TEXTES_FAMILLES, type FamilleReseau } from './instruments'
import { FAMILLES_SITU, NOMS_FAMILLES, libellesSituation, synthese, toneSituation, type Synthese, type Ton } from './situations'
import type { CommuneYearStats } from './types'

/**
 * Bulletin d'une commune ou d'un réseau (maquette « vigilance + instruments » du 23/09) : le verdict en une
 * phrase, sa phrase d'appui, l'ordre des onglets de réseaux et les comptes de l'année. Tout jugement vient de
 * `synthese()` (lib/situations.ts), la source des tableaux de réseaux : le verdict reste synchronisé mot pour mot
 * avec les lignes des familles qu'il surplombe (CLAUDE.md) — jamais « conforme toute l'année » quand une classe
 * intermédiaire figure au détail, et la réserve est alors nommée.
 */

/** Réseau d'un bulletin : code SISE, nom, code de situation de l'année (null : non analysé cette année). */
export interface ReseauBulletin {
  code: string
  nom: string
  situation: string | null | undefined
}

/** Énumération française : « a, b et c ». */
export function liste(mots: readonly string[]): string {
  if (mots.length <= 1) return mots[0] ?? ''
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`
}

/** Nom d'une famille au fil d'une phrase : « métaux et minéraux », « PFAS ». */
const nomMinuscule = (f: FamilleReseau) => (f === 'pfas' ? 'PFAS' : TEXTES_FAMILLES[f].titre.toLowerCase())

/** Ton du voyant d'un bulletin : celui de la situation d'ensemble, « na » sans famille analysée. */
export function tonBulletin(s: Synthese): Ton | 'na' {
  return s.global == null ? 'na' : toneSituation('toutes', s.global)
}

/** État écrit d'un voyant, pour les lecteurs d'écran : le voyant est décoratif. `feminin` : une famille. */
export function etatTon(ton: Ton | 'na' | null, feminin = false): string {
  if (ton === 'good') return 'conforme'
  if (ton === 'warn') return 'non conforme'
  if (ton === 'bad') return 'restriction ou consigne'
  return feminin ? 'non analysée' : 'non analysé'
}

/** Titre du verdict ; null sans famille analysée. */
export function phraseVerdict(s: Synthese, annee: string | number): string | null {
  if (s.global == null) return null
  if (s.global === 2) return `Restriction ou consigne de consommation en ${annee}`
  if (s.global === 1) return `Non conforme en ${annee} pour ${s.ennuis.length > 1 ? 'les familles' : 'la famille'} ${liste(s.ennuis.map((f) => NOMS_FAMILLES[f]))}`
  if (s.reserves.length) return `Eau conforme aux limites réglementaires en ${annee}`
  const n = s.analysees.length
  return `Eau conforme toute l'année pour ${n > 1 ? `les ${n} familles analysées` : 'la famille analysée'}`
}

/** « Avec une réserve : nitrates, maximum de 40 à 50 mg/L. » ; vide sans réserve. */
function phraseReserves(s: Synthese): string {
  if (!s.reserves.length) return ''
  const items = s.reserves.map((f) => `${NOMS_FAMILLES[f]}, ${libellesSituation(f)[s.pire[f]!]}`)
  return `${items.length > 1 ? 'Avec des réserves' : 'Avec une réserve'} : ${items.join(' ; ')}.`
}

/** « Nitrates et PFAS non analysés cette année. » ; la bactériologie seule s'accorde au féminin. */
function phraseNonAnalysees(fams: FamilleReseau[]): string {
  if (!fams.length) return ''
  const noms = fams.map((f, i) => (i === 0 ? TEXTES_FAMILLES[f].titre : nomMinuscule(f)))
  return `${liste(noms)} ${fams.length === 1 && fams[0] === 'microbio' ? 'non analysée' : 'non analysés'} cette année.`
}

/**
 * État d'un réseau non conforme, dans la phrase d'appui d'un bulletin à plusieurs réseaux. Une restriction dont
 * la seule cause est la bactériologie est écrite comme sa classe (« consigne d'ébullition ou restriction ») :
 * l'ARS y prescrit le plus souvent de faire bouillir l'eau, pas de ne plus la boire.
 */
function etatReseau(s: Synthese): string {
  if (s.global !== 2) return 'dépassement constaté'
  const restrictions = s.ennuis.filter((f) => toneSituation(f, s.pire[f]!) === 'bad')
  if (restrictions.every((f) => f === 'microbio')) return "consigne d'ébullition ou restriction"
  return restrictions.includes('microbio') ? 'restriction ou consigne' : 'restriction de consommation'
}

/**
 * Phrase d'appui du verdict. Un réseau : les familles en cause avec le libellé de leur classe, les familles non
 * analysées, les réserves. Plusieurs : les réseaux concernés, du plus au moins défavorable, puis les réseaux non
 * analysés et les réserves de l'ensemble. `desservi` complète « réseaux qui desservent … » (« la commune »).
 */
export function texteVerdict(reseaux: readonly ReseauBulletin[], desservi = 'la commune'): string {
  const s = synthese(reseaux.map((r) => r.situation))
  const parts: string[] = []
  if (reseaux.length === 1) {
    for (const f of s.ennuis) parts.push(`${TEXTES_FAMILLES[f].titre} : ${libellesSituation(f)[s.pire[f]!]}.`)
    if (s.global != null) parts.push(phraseNonAnalysees(FAMILLES_SITU.filter((f) => !s.analysees.includes(f))))
  } else {
    const parReseau = ordreReseaux(reseaux).map((r) => ({ r, s: synthese([r.situation]) }))
    const touches = parReseau.filter((x) => (x.s.global ?? 0) > 0)
    if (touches.length) {
      const bouts = touches.map((x) => `${etatReseau(x.s)} sur le réseau ${x.r.nom.trim()} (${x.s.ennuis.map(nomMinuscule).join(', ')})`)
      parts.push(`${touches.length} des ${reseaux.length} réseaux qui desservent ${desservi} ${touches.length > 1 ? 'sont concernés' : 'est concerné'} : ${bouts.join(' ; ')}.`)
    }
    const muets = parReseau.filter((x) => x.s.global == null).length
    if (muets) parts.push(`${muets} des ${reseaux.length} réseaux ${muets > 1 ? "n'ont pas été analysés" : "n'a pas été analysé"} cette année.`)
  }
  parts.push(phraseReserves(s))
  return parts.filter(Boolean).join(' ')
}

/** Rang de gravité d'un réseau : restriction, non conforme, conforme, puis non analysé. */
const gravite = (r: ReseauBulletin) => synthese([r.situation]).global ?? -1

/** Onglets des réseaux : du plus défavorable au plus favorable, puis par nom. */
export function ordreReseaux<T extends ReseauBulletin>(reseaux: readonly T[]): T[] {
  return [...reseaux].sort((a, b) => gravite(b) - gravite(a) || a.nom.localeCompare(b.nom, 'fr'))
}

/** Réseau affiché d'office : le plus défavorable, premier onglet. */
export const reseauParDefaut = <T extends ReseauBulletin>(reseaux: readonly T[]): T | null => ordreReseaux(reseaux)[0] ?? null

export interface Comptes {
  prelevements: number
  analyses: number
  /** analyses au-dessus d'une limite de qualité */
  depassements: number
}

/** Comptes de l'année, comme les chiffres de la fiche (QualityStats) : prélèvements, analyses, dépassements. */
export function comptes(s: CommuneYearStats | undefined): Comptes | null {
  if (!s) return null
  const fams = Object.values(s.fam)
  return {
    prelevements: s.plv[0],
    analyses: fams.reduce((a, f) => a + (f?.[0] ?? 0), 0),
    depassements: fams.reduce((a, f) => a + (f?.[1] ?? 0), 0),
  }
}

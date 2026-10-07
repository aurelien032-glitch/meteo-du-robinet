import { TEXTES_FAMILLES, type FamilleReseau } from './instruments'
import {
  CLASSES_ARS,
  estPartiel,
  FAMILLES_SITU,
  NOMS_FAMILLES,
  libelleClasse,
  synthese,
  toneSituation,
  type classeArs,
  type LettreArs,
  type Synthese,
  type Ton,
} from './situations'
import type { CommuneYearStats } from './types'

/**
 * Bulletin d'une commune ou d'un réseau (maquette « vigilance + instruments » du 23/09) : le verdict en une
 * phrase, sa phrase d'appui, l'ordre des onglets de réseaux et les comptes de l'année. Tout jugement vient de
 * `synthese()` (lib/situations.ts), la source des tableaux de réseaux : le verdict reste synchronisé mot pour mot
 * avec les lignes des familles qu'il surplombe (CLAUDE.md) — jamais « conforme toute l'année » quand une classe
 * intermédiaire figure au détail, et la réserve est alors nommée.
 */

/**
 * Sous un verdict « non conforme » (choix de l'auteur, 24/09) : « Non conforme », sous « Puis-je boire l'eau ? », se
 * lisait « non ». Un dépassement ne suffit pas à déconseiller l'eau ; seul un avis de l'ARS le fait. Textes partagés
 * par le bulletin (components/Bulletin.tsx) et les fiches pré-générées (lib/prerendu.ts).
 */
/**
 * Titre du bulletin d'une commune (page et fiche pré-générée). « Puis-je boire l'eau du robinet ? » laissait attendre une
 * réponse sanitaire du site, qui n'en donne pas (choix de l'auteur, 2026-10-05, prudence juridique).
 */
export const TITRE_BULLETIN_COMMUNE = 'Qualité de l’eau du robinet'
export const CONSTAT_DEPASSEMENT = 'Une limite de qualité a été dépassée au moins une fois dans l’année.'
/** Texte de l'auteur du 2026-10-05 (refonte, lot 1), partout où un dépassement est rappelé. */
export const RAPPEL_DEPASSEMENT =
  'Un dépassement de limite de qualité ne suffit pas, à lui seul, à déconseiller la consommation de l’eau ; seules les autorités sanitaires peuvent le faire.'
/** À la place du rappel quand l'ARS a émis un avis dans l'année : la phrase y renvoie au lieu de le contredire. */
export const renvoiAvis = (annee: string | number) =>
  `Les avis émis par l’ARS au cours de l’année sont présentés dans la rubrique « Avis de l’ARS en ${annee} », ci-dessous.`

/** Réseau d'un bulletin : code SISE, nom, code de situation de l'année (null : non analysé cette année). */
export interface ReseauBulletin {
  code: string
  nom: string
  situation: string | null | undefined
  /** classe A–D selon la méthode de l'ARS (situations.classeArs) ; absente des fichiers antérieurs */
  ars?: ReturnType<typeof classeArs>
}

/**
 * Classe A–D d'un réseau en une phrase : libellé de l'ARS et, hors classe A, les familles qui la font
 * (« Eau de qualité convenable … : autres limites de qualité. »). null sans classe.
 */
export function phraseClasseArs(ars: ReseauBulletin['ars']): { lettre: LettreArs; texte: string } | null {
  if (!ars) return null
  const causes = FAMILLES_SITU.filter((f) => ars.familles[f] === ars.classe).map((f) =>
    ars.reportees?.includes(f) ? `${NOMS_FAMILLES[f]}, d’après les résultats des années précédentes` : NOMS_FAMILLES[f],
  )
  const texte = ars.classe === 'A' ? `${CLASSES_ARS.A}.` : `${CLASSES_ARS[ars.classe]} (${liste(causes)}).`
  return { lettre: ars.classe, texte }
}

/** Mise en garde sous la classe : calculée par le site ; la synthèse de l'ARS jointe à la facture fait foi. */
export const MISE_EN_GARDE_ARS =
  'Note calculée par le site selon les principes de l’indicateur global de l’ARS, sans les paramètres liés aux canalisations ni aux réactifs de traitement ; une famille sans analyse dans une année close reprend la note de sa dernière année analysée, cinq ans au plus. La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi.'

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

/** Période d'une absence d'analyse : l'année, ou depuis le 1er janvier pour l'année en cours (estPartiel). */
const depuis = (annee?: string | number) => (estPartiel(annee) ? 'depuis le 1er janvier' : 'cette année')

/**
 * Titre du verdict, d'une synthèse établie pour `annee` ; null sans famille analysée. Année en cours : un dépassement
 * reste daté de l'année (« Non conforme en 2026 »), une conformité ne vaut que depuis le 1er janvier.
 */
export function phraseVerdict(s: Synthese, annee: string | number): string | null {
  if (s.global == null) return null
  if (s.global === 2) return `Restriction ou consigne de consommation en ${annee}`
  if (s.global === 1) return `Non conforme en ${annee} pour ${s.ennuis.length > 1 ? 'les familles' : 'la famille'} ${liste(s.ennuis.map((f) => NOMS_FAMILLES[f]))}`
  const partiel = estPartiel(annee)
  if (s.reserves.length) return `Eau conforme aux limites réglementaires ${partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`}`
  const n = s.analysees.length
  const familles = n > 1 ? `les ${n} familles analysées` : 'la famille analysée'
  return partiel ? `Eau conforme depuis le 1er janvier ${annee} pour ${familles}` : `Eau conforme toute l'année pour ${familles}`
}

/** « Avec une réserve : nitrates, maximum de 40 à 50 mg/L. » ; vide sans réserve. */
function phraseReserves(s: Synthese, annee?: string | number): string {
  if (!s.reserves.length) return ''
  const items = s.reserves.map((f) => `${NOMS_FAMILLES[f]}, ${libelleClasse(f, s.pire[f]!, annee)}`)
  return `${items.length > 1 ? 'Avec des réserves' : 'Avec une réserve'} : ${items.join(' ; ')}.`
}

/**
 * « Nitrates et PFAS non analysés cette année. » Accord : au féminin quand toutes les familles nommées le sont
 * (bactériologie, autres limites de qualité), au pluriel dès qu'il y en a plusieurs ou que le nom l'est (« limites »).
 */
function phraseNonAnalysees(fams: FamilleReseau[], annee?: string | number): string {
  if (!fams.length) return ''
  const noms = fams.map((f, i) => (i === 0 ? TEXTES_FAMILLES[f].titre : nomMinuscule(f)))
  const feminin = fams.every((f) => f === 'microbio' || f === 'autres')
  const pluriel = fams.length > 1 || fams[0] === 'autres'
  return `${liste(noms)} non ${feminin ? (pluriel ? 'analysées' : 'analysée') : 'analysés'} ${depuis(annee)}.`
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
export function texteVerdict(reseaux: readonly ReseauBulletin[], desservi = 'la commune', annee?: string | number): string {
  const s = synthese(reseaux.map((r) => r.situation))
  const parts: string[] = []
  if (reseaux.length === 1) {
    for (const f of s.ennuis) parts.push(`${TEXTES_FAMILLES[f].titre} : ${libelleClasse(f, s.pire[f]!, annee)}.`)
    if (s.global != null) parts.push(phraseNonAnalysees(FAMILLES_SITU.filter((f) => !s.analysees.includes(f)), annee))
  } else {
    const parReseau = ordreReseaux(reseaux).map((r) => ({ r, s: synthese([r.situation]) }))
    const touches = parReseau.filter((x) => (x.s.global ?? 0) > 0)
    if (touches.length) {
      // « sur le réseau RESEAU ILET QUINQUINA » : le mot n'est pas répété quand le nom du réseau commence par lui.
      const bouts = touches.map(
        (x) => `${etatReseau(x.s)} sur le réseau ${x.r.nom.trim().replace(/^r[eé]seau\s+/i, '')} (${x.s.ennuis.map(nomMinuscule).join(', ')})`,
      )
      parts.push(`${touches.length} des ${reseaux.length} réseaux qui desservent ${desservi} ${touches.length > 1 ? 'sont concernés' : 'est concerné'} : ${bouts.join(' ; ')}.`)
    }
    const muets = parReseau.filter((x) => x.s.global == null).length
    if (muets) parts.push(`${muets} des ${reseaux.length} réseaux ${muets > 1 ? "n'ont pas été analysés" : "n'a pas été analysé"} ${depuis(annee)}.`)
  }
  parts.push(phraseReserves(s, annee))
  return parts.filter(Boolean).join(' ')
}

/** Rang de gravité d'un réseau pour l'année : restriction, non conforme, conforme, puis non analysé. */
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

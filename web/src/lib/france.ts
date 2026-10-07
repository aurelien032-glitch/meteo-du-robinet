import { partClasse, type ComptesClasses } from './accueil'
import { LETTRES_ARS, LIBELLES_ARS } from './bilan'
import { classable, EFFECTIF_MIN } from './classement'
import { fmt } from './data'
import { NBSP, sansFranchir } from './instruments'
import { niveauxScale, PALIERS_PARTS, type Scale } from './scale'
import { classeArs, estPartiel, type LettreArs, type SituationsFile } from './situations'
import { cssVar } from './theme'
import { deptCode, type DeptFile } from './types'

/**
 * Page « La France » (refonte, lot 3, maquette validée par l'auteur le 2026-10-05) et tête de la fiche département : la
 * classe A–D de chaque réseau, calculée par le site selon la méthode de l'indicateur de l'ARS (situations.classeArs,
 * comme les fiches et l'accueil), comptée par département. Prudence juridique : classes « calculées par le site », la
 * synthèse de l'ARS fait foi ; aucun palmarès (liste alphabétique, tri au choix du visiteur, règle des classements par
 * part : lib/classement.ts) ; aucune cause avancée, aucun responsable désigné.
 */

// --- Comptes par département ---------------------------------------------------------------------------------------

/** Département d'un réseau : préfixe de son code (délégation de l'ARS qui le suit), comme situations.depts. */
export const deptDuReseau = (code: string) => deptCode(code.slice(0, 3))

/**
 * Réseaux par classe A–D de chaque département (même règle que comptesClasses : la pire lettre du réseau ; les réseaux
 * sans classe calculée tenus à part).
 */
export function comptesParDepartement(situ: SituationsFile | null | undefined): Map<string, ComptesClasses> {
  const m = new Map<string, ComptesClasses>()
  if (!situ) return m
  for (const code of Object.keys(situ.reseaux)) {
    const d = deptDuReseau(code)
    let c = m.get(d)
    if (!c) m.set(d, (c = { A: 0, B: 0, C: 0, D: 0, classes: 0, nonClasses: 0 }))
    const a = classeArs(situ, code)
    if (a) {
      c[a.classe]++
      c.classes++
    } else c.nonClasses++
  }
  return m
}

/** Réseaux classés C ou D. */
export const nbCD = (c: ComptesClasses) => c.C + c.D

/** Part des réseaux classés C ou D parmi les réseaux classés (0–1) ; null sans réseau classé. */
export const partCD = (c: ComptesClasses | null | undefined): number | null => (c && c.classes ? nbCD(c) / c.classes : null)

const BORNES_PCT = PALIERS_PARTS.slice(1).map((b) => Math.round(b * 100))

/**
 * Part des réseaux classés C ou D, écrite à une décimale comme dans la maquette (« 77,8 % »), sans franchir une borne de
 * la légende à l'arrondi (4,97 % ne s'écrit pas « 5,0 % », qui la rangerait dans « 5–10 »).
 */
export function pctPartCD(part: number): string {
  const v = part * 100
  return `${sansFranchir(v, BORNES_PCT, (d) => fmt.dec(v, d), 1, true)}${NBSP}%`
}

/** Effectif d'une part, écrit « 217 sur 279 ». */
export const effectifCD = (c: ComptesClasses) => `${fmt.int(nbCD(c))} sur ${fmt.int(c.classes)}`

/** Ligne du tableau « Les départements ». */
export interface LigneFrance {
  dd: string
  nom: string
  comptes: ComptesClasses
  /** part des réseaux classés C ou D ; null sans réseau classé */
  part: number | null
  /** la part repose sur assez de réseaux pour entrer dans un tri (règle des classements, lib/classement.ts) */
  classable: boolean
}

/**
 * Lignes du tableau, une par département qui compte au moins un réseau, dans l'ordre alphabétique. Effectif de la règle
 * des classements : les réseaux classés, parmi tous les réseaux du département (sans classe comprise).
 */
export function lignesFrance(parDept: ReadonlyMap<string, ComptesClasses>, nom: (dd: string) => string): LigneFrance[] {
  const lignes = [...parDept.entries()].map(([dd, comptes]) => ({
    dd,
    nom: nom(dd),
    comptes,
    part: partCD(comptes),
    classable: classable(comptes.classes, comptes.classes + comptes.nonClasses),
  }))
  return trierFrance(lignes, { cle: 'nom', desc: false })
}

export type CleTri = 'nom' | 'part'
export interface TriFrance {
  cle: CleTri
  desc: boolean
}

const parNom = (a: LigneFrance, b: LigneFrance) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd)

/**
 * Tri choisi par le visiteur (aucun palmarès par défaut : l'ordre alphabétique). Par part, dans un sens ou dans l'autre :
 * les départements dont la part repose sur moins de EFFECTIF_MIN réseaux, sauf s'ils sont tous classés, vont en fin de
 * liste, puis ceux sans réseau classé ; à part égale, l'ordre alphabétique.
 */
export function trierFrance(lignes: readonly LigneFrance[], tri: TriFrance): LigneFrance[] {
  const s = tri.desc ? -1 : 1
  if (tri.cle === 'nom') return [...lignes].sort((a, b) => s * parNom(a, b))
  const rang = (l: LigneFrance) => (l.part == null ? 2 : l.classable ? 0 : 1)
  return [...lignes].sort((a, b) => rang(a) - rang(b) || (a.part != null && b.part != null ? s * (a.part - b.part) : 0) || parNom(a, b))
}

/** Valeur de `aria-sort` d'une colonne. */
export const ariaSort = (tri: TriFrance, cle: CleTri): 'ascending' | 'descending' | 'none' => (tri.cle !== cle ? 'none' : tri.desc ? 'descending' : 'ascending')

/** Tri suivant après un clic sur une colonne : la part s'ouvre sur les plus fortes, le nom sur l'ordre alphabétique. */
export const triSuivant = (tri: TriFrance, cle: CleTri): TriFrance => (tri.cle === cle ? { cle, desc: !tri.desc } : { cle, desc: cle === 'part' })

/** Phrase d'état du tri, lue par les lecteurs d'écran (role="status"). */
export function phraseTri(tri: TriFrance): string {
  if (tri.cle === 'nom') return tri.desc ? 'Départements dans l’ordre alphabétique inverse.' : 'Départements dans l’ordre alphabétique.'
  return `Départements triés par part des réseaux notés C ou D, ${tri.desc ? 'de la plus forte à la plus faible' : 'de la plus faible à la plus forte'}. Les parts calculées sur moins de ${EFFECTIF_MIN} réseaux notés sont placées en fin de liste.`
}

// --- Téléchargement du tableau -------------------------------------------------------------------------------------

/** Champ CSV : entre guillemets quand il contient le séparateur, un guillemet, un retour à la ligne ; guillemets doublés. */
export function champCsv(v: string | number | null | undefined): string {
  const s = v == null ? '' : typeof v === 'number' ? decimale(v) : v
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Nombre en notation française pour un tableur (virgule décimale, sans espace de milliers). */
function decimale(n: number): string {
  return String(n).replace('.', ',')
}

/** Arrondi à une décimale, en nombre (pour le CSV). */
const unDecimal = (part: number) => Math.round(part * 1000) / 10

/** En-têtes du fichier, en français. */
export const ENTETES_CSV = [
  'Code du département',
  'Département',
  'Année',
  'Réseaux notés',
  'Note A',
  'Note B',
  'Note C',
  'Note D',
  'Réseaux notés C ou D',
  'Part des réseaux notés C ou D (%)',
  'Réseaux sans note',
  'Part retenue dans les tris (10 réseaux au moins, ou tous)',
] as const

/**
 * Tableau des départements en CSV (séparateur « ; », virgule décimale, en-têtes en français, fins de ligne CRLF) ; la
 * marque d'ordre des octets UTF-8 en tête, pour que les tableurs lisent les accents. Lignes dans l'ordre donné.
 */
export function csvFrance(lignes: readonly LigneFrance[], annee: string | number): string {
  const corps = lignes.map((l) => {
    const c = l.comptes
    return [l.dd, l.nom, String(annee), c.classes, c.A, c.B, c.C, c.D, nbCD(c), l.part == null ? null : unDecimal(l.part), c.nonClasses, l.classable ? 'oui' : 'non']
      .map(champCsv)
      .join(';')
  })
  return '﻿' + [ENTETES_CSV.map(champCsv).join(';'), ...corps].join('\r\n') + '\r\n'
}

/**
 * Nom du fichier, daté : année des données (« depuis le 1er janvier » pour l'année en cours) et jour du téléchargement,
 * « meteo-du-robinet_notes-departements_2025_2026-10-05.csv ».
 */
export function nomFichierCsv(annee: string | number, jour: Date): string {
  const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`
  return `meteo-du-robinet_classes-departements_${annee}${estPartiel(annee) ? '-depuis-le-1er-janvier' : ''}_${iso}.csv`
}

// --- Communes : la lettre la plus défavorable des réseaux qui les desservent --------------------------------------

export interface LettreCommune {
  /** lettre la plus défavorable des réseaux classés ; null si aucun n'a de classe calculée */
  lettre: LettreArs | null
  /** réseaux qui desservent la commune cette année-là */
  reseaux: number
}

/** Lettre la plus défavorable d'une liste de réseaux, selon classeArs ; null si aucun n'est classé. */
export function pireLettreReseaux(situ: SituationsFile | null | undefined, codes: readonly string[]): LettreArs | null {
  let pire: LettreArs | null = null
  for (const code of codes) {
    const l = classeArs(situ, code)?.classe
    if (l && (!pire || l > pire)) pire = l
  }
  return pire
}

/**
 * Lettre de chaque commune d'un département pour une année : celle du réseau le plus défavorable qui la dessert, comme
 * la carte communale d'une famille (dept/<dd>.json : réseaux de chaque commune par année ; situations/<année>.json :
 * classes). Une commune sans réseau rattaché cette année-là est absente.
 */
export function lettresCommunes(dept: DeptFile | null | undefined, situ: SituationsFile | null | undefined, annee: string | number | null | undefined): Map<string, LettreCommune> {
  const m = new Map<string, LettreCommune>()
  if (!dept || !situ || annee == null) return m
  for (const [insee, c] of Object.entries(dept.communes)) {
    const codes = c.reseaux[String(annee)] ?? []
    if (!codes.length) continue
    m.set(insee, { lettre: pireLettreReseaux(situ, codes), reseaux: codes.length })
  }
  return m
}

/** Rang d'une lettre sur l'échelle de la carte (0 = A … 3 = D) ; null sans lettre. */
export const rangLettre = (l: LettreArs | null | undefined): number | null => (l ? LETTRES_ARS.indexOf(l) : null)

/**
 * Couleurs des lettres sur une carte : celles des gouttes et des tuiles, A en bleu clair partout (auteur, 07/10, « A en
 * bleu clair partout »), B en jaune, C en orange, D en rouge, paliers de la carte. Jetons dont les paires sont vérifiées
 * sous daltonisme.
 */
export const JETONS_LETTRES: Record<LettreArs, string> = { A: '--good-line', B: '--warn-line', C: '--warn', D: '--bad' }

/** Échelle de la carte communale des classes (rangs 0 à 3). */
export const classesScale: Scale = niveauxScale(() => LETTRES_ARS.map((l) => cssVar(JETONS_LETTRES[l])))

/** Légende de la carte communale : une case par lettre, libellé de l'indicateur marqué, couleur en jeton CSS (suit le thème). */
export const legendeClasses = (): { couleur: string; libelle: string }[] =>
  LETTRES_ARS.map((l) => ({ couleur: `var(${JETONS_LETTRES[l]})`, libelle: `${l} ${LIBELLES_ARS[l]}*` }))

/** État d'une commune dans l'info-bulle de la carte des classes. */
export function etatLettreCommune(c: LettreCommune | undefined, annee: string | number): string {
  if (!c) return `aucun réseau rattaché en ${annee}`
  const n = c.reseaux > 1 ? `${fmt.int(c.reseaux)} réseaux` : 'un réseau'
  if (!c.lettre) return `pas de note (${n})`
  return `${c.reseaux > 1 ? 'note la plus défavorable' : 'note'} ${c.lettre}, ${LIBELLES_ARS[c.lettre]}* (${n})`
}

// --- Textes ----------------------------------------------------------------------------------------------------------

/** Phrase de tête de la page « La France » (maquette du 2026-10-05). */
export const PHRASE_FRANCE =
  'Note de chaque réseau d’eau potable, calculée par le site à partir des données publiques selon la méthode de l’indicateur de l’ARS. La synthèse de l’ARS jointe à la facture d’eau fait foi et peut différer.'

/** Phrase de prudence du bilan d'un département (fiche département). */
export const PHRASE_BILAN_DEPT =
  'Note de chaque réseau du département, calculée par le site à partir des analyses publiques, selon la méthode de l’indicateur de l’ARS. La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi et peut différer.'

/** Ce que mesure la part, sous le titre du tableau : sans palmarès ni cause. */
export const PHRASE_PART =
  'Par ordre alphabétique ; un tri par part est proposé. La part dépend notamment de l’origine de l’eau et du nombre de réseaux de chaque département.'

/** Rappel sur la classe C (maquette). */
export const PHRASE_CLASSE_C =
  'La note C comprend aussi les eaux déconseillées par l’ARS aux publics sensibles (nourrissons, femmes enceintes) pour un paramètre en cause.'

/**
 * Écart entre la note et les situations des familles, là où les deux comptes se côtoient (fiche département ; critique UX
 * du 2026-10-05) : la note de la bactériologie suit la grille de l'ARS, sur les derniers prélèvements, et une note D ne
 * suppose pas de restriction.
 */
export const PHRASE_ECART_NOTE =
  'Ces situations suivent le bilan officiel de chaque famille, sur la seule année. La note A–D suit l’indicateur de l’ARS : sa bactériologie porte sur les derniers prélèvements, années antérieures comprises, et une note D ne suppose pas une restriction. Les deux comptes peuvent donc différer.'

/** Pied de la page (maquette) : méthode et source. */
export const PIED_FRANCE =
  'Notes calculées par le site selon les principes de l’indicateur global de l’ARS (note d’information de la direction générale de la santé du 19 juillet 2019). La synthèse de l’ARS jointe à la facture d’eau fait foi.'

/** Légende de la carte des départements. */
export const DESC_CARTE_DEPTS = 'part des réseaux notés C ou D (notes calculées par le site)'

/** Légende de la carte des communes. */
export const DESC_CARTE_COMMUNES = 'note la plus défavorable des réseaux qui desservent la commune (notes calculées par le site)'

/** Note de la barre d'année ; l'année en cours donne des lettres provisoires. */
export function noteAnnee(annee: number | undefined, quoi: string): string {
  return estPartiel(annee)
    ? `${quoi} Pour ${annee}, les notes sont provisoires : elles reposent sur les prélèvements publiés depuis le 1er janvier.`
    : quoi
}

/** Info-bulle et encart d'un département : part, effectif et répartition. */
export function infoBulleDept(nom: string, dd: string, c: ComptesClasses | undefined, annee: string | number): string {
  const tete = `<b>${nom}</b> (${dd})`
  if (!c || !c.classes) return `${tete}<br>aucun réseau noté en ${annee}`
  const repartition = LETTRES_ARS.map((l) => `${l} ${fmt.int(c[l])}`).join(' · ')
  return `${tete}<br>${pctPartCD(partCD(c)!)} des réseaux notés C ou D (${effectifCD(c)})<br><span class="muted">${repartition}</span>`
}

/** Part d'une classe, écrite (« 75,0 % »), pour les quatre chiffres. */
export const partEcrite = (c: ComptesClasses, l: LettreArs) => fmt.pct(100 * (partClasse(c, l) ?? 0), 1)

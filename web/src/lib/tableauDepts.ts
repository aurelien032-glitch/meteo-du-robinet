import { classable, EFFECTIF_MIN } from './classement'
import { champCsv } from './france'
import { estPartiel } from './situations'

/**
 * Tableaux des départements des pages de sujets (refonte, lot 4, règle de l'auteur du 2026-10-05) : la généralisation du
 * tableau de « La France » (lib/france.ts). Ordre alphabétique par défaut, aucun palmarès ; le visiteur trie par une
 * colonne s'il le souhaite. Une part qui repose sur moins de EFFECTIF_MIN unités (réseaux, analyses), sauf si elle les
 * couvre toutes, est signalée « hors tri » et va en fin de liste quand on trie par elle (règle des classements,
 * lib/classement.ts) ; une valeur absente va tout à la fin. Téléchargement CSV construit dans le navigateur.
 */

/** Ligne minimale : un département, son code et son nom. */
export interface LigneDept {
  dd: string
  nom: string
}

/** Colonne triable : sa valeur numérique, et, pour une part, si elle est assez étayée pour entrer dans un tri. */
export interface CleTriable<T> {
  cle: string
  valeur: (l: T) => number | null
  /** part soumise à la règle des classements : vrai si elle se classe ; absent pour un simple compte */
  classable?: (l: T) => boolean
}

export interface Tri {
  /** « nom », ou la clé d'une colonne triable */
  cle: string
  desc: boolean
}

export const TRI_ALPHABETIQUE: Tri = { cle: 'nom', desc: false }

const parNom = (a: LigneDept, b: LigneDept) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd)

/** Lignes dans l'ordre alphabétique des noms de département. */
export const alphabetique = <T extends LigneDept>(lignes: readonly T[]): T[] => [...lignes].sort(parNom)

/**
 * Tri choisi par le visiteur. Par le nom, dans un sens ou dans l'autre ; par une colonne : les valeurs étayées d'abord,
 * puis les parts hors tri, puis les valeurs absentes ; à valeur égale, l'ordre alphabétique.
 */
export function trierLignes<T extends LigneDept>(lignes: readonly T[], tri: Tri, colonnes: readonly CleTriable<T>[]): T[] {
  const s = tri.desc ? -1 : 1
  const col = colonnes.find((c) => c.cle === tri.cle)
  if (tri.cle === 'nom' || !col) return [...lignes].sort((a, b) => (tri.cle === 'nom' ? s : 1) * parNom(a, b))
  const rang = (l: T) => (col.valeur(l) == null ? 2 : col.classable && !col.classable(l) ? 1 : 0)
  return [...lignes].sort((a, b) => {
    const va = col.valeur(a)
    const vb = col.valeur(b)
    return rang(a) - rang(b) || (va != null && vb != null ? s * (va - vb) : 0) || parNom(a, b)
  })
}

/** Tri suivant après un clic : une colonne de valeurs s'ouvre sur les plus fortes, le nom sur l'ordre alphabétique. */
export const triApres = (tri: Tri, cle: string): Tri => (tri.cle === cle ? { cle, desc: !tri.desc } : { cle, desc: cle !== 'nom' })

/** Valeur de `aria-sort` d'une colonne. */
export const ariaTri = (tri: Tri, cle: string): 'ascending' | 'descending' | 'none' => (tri.cle !== cle ? 'none' : tri.desc ? 'descending' : 'ascending')

/**
 * Phrase d'état du tri, lue par les lecteurs d'écran (role="status") : `quoi` nomme la colonne triée (« la part des
 * réseaux non conformes ») ; `partielle`, qu'il s'agit d'une part soumise à la règle des classements.
 */
export function phraseTriSujet(tri: Tri, quoi: string, partielle: boolean, unite = 'réseaux analysés'): string {
  if (tri.cle === 'nom') return tri.desc ? 'Départements dans l’ordre alphabétique inverse.' : 'Départements dans l’ordre alphabétique.'
  const sens = tri.desc ? 'de la plus forte à la plus faible' : 'de la plus faible à la plus forte'
  return `Départements triés par ${quoi}, ${sens}.${partielle ? ` Les parts calculées sur moins de ${EFFECTIF_MIN} ${unite} sont placées en fin de liste.` : ''}`
}

/** Fichier CSV (séparateur « ; », virgule décimale, CRLF, marque d'ordre des octets UTF-8 pour les tableurs). */
export function csvTableau(entetes: readonly string[], lignes: readonly (readonly (string | number | null | undefined)[])[]): string {
  return '﻿' + [entetes.map(champCsv).join(';'), ...lignes.map((l) => l.map(champCsv).join(';'))].join('\r\n') + '\r\n'
}

/** Part arrondie à une décimale, en pourcentage (pour un CSV) ; null sans part. */
export const pctCsv = (part: number | null | undefined): number | null => (part == null ? null : Math.round(part * 1000) / 10)

/**
 * Nom du fichier, daté : sujet, année des données (« depuis le 1er janvier » pour l'année en cours) et jour du
 * téléchargement, « meteo-du-robinet_pfas-departements_2025_2026-10-05.csv ».
 */
export function nomFichierSujet(sujet: string, annee: string | number, jour: Date): string {
  const iso = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`
  return `meteo-du-robinet_${sujet}-departements_${annee}${estPartiel(annee) ? '-depuis-le-1er-janvier' : ''}_${iso}.csv`
}

// --- Carte détaillée (/carte) ---------------------------------------------------------------------------------------

/** Effectif d'une part (lib/classement.ts) : réseaux analysés, analyses ou prélèvements évalués, et total du département. */
export interface Effectif {
  n: number
  unite: [string, string]
  total?: number
}

/** Ligne du tableau des départements de la carte détaillée : valeur de l'indicateur, effectif, règle des classements. */
export interface LigneCarte extends LigneDept {
  v: number | null
  e: Effectif | null
  /** la part repose sur assez d'unités pour entrer dans un tri ; toujours vrai pour un compte ou un maximum (sans effectif) */
  classable: boolean
}

/**
 * Lignes du tableau de /carte (refonte, lot 4 : il remplace « Départements les plus touchés »), une par département, dans
 * l'ordre alphabétique ; `garder` écarte les départements sans valeur à montrer.
 */
export function lignesCarte(
  codes: Iterable<string>,
  valeur: (dd: string) => number | null,
  effectif: (dd: string) => Effectif | null,
  nom: (dd: string) => string,
  garder: (dd: string, v: number | null) => boolean = (_, v) => v != null,
): LigneCarte[] {
  const lignes: LigneCarte[] = []
  for (const dd of new Set(codes)) {
    const v = valeur(dd)
    if (!garder(dd, v)) continue
    const e = effectif(dd)
    lignes.push({ dd, nom: nom(dd), v, e, classable: !e || classable(e.n, e.total) })
  }
  return alphabetique(lignes)
}

/** Rangées montrées avant « Afficher les 101 départements » : tableaux déroulés, sans défilement interne (critique UX du 2026-10-05). */
export const RANGEES_REPLIEES = 15

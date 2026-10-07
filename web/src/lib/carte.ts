import { fmt } from './data'
import { NBSP, sansFranchir } from './instruments'
import { PALIERS_PARTS, palierPart } from './scale'
import { enRestriction, FAMILLES_SITU, NOMS_FAMILLES, nonConformes, partNonConformes, reseauxAnalyses, type FamilleSitu, type Repartition } from './situations'

/**
 * Carte des départements de l'accueil (maquette du 23/09) : part des réseaux non conformes sur la rampe de la qualité
 * de l'eau, aux couleurs des notes (paliers PALIERS_PARTS, lib/scale.ts ; 07/10), avec sa légende, sa lecture et son
 * tableau. Le dessin vient du pipeline (geo/departements-svg.json) ; ici, ce qui se calcule.
 */

/** Palier de la carte (1 à 4, couleurs des notes) ; 0 sans réseau analysé, dessiné hachuré. */
export function classePart(part: number | null | undefined): number {
  return part == null ? 0 : palierPart(part) + 1
}

const BORNES_PCT = PALIERS_PARTS.map((b) => Math.round(b * 100))

/** Étiquettes de la légende, en % : « < 10 », « 10–25 », « 25–50 », « ≥ 50 ». */
export const ETIQUETTES_PARTS = BORNES_PCT.map((b, i) =>
  i === 0 ? `< ${BORNES_PCT[1]}` : i === BORNES_PCT.length - 1 ? `≥ ${b}` : `${b}–${BORNES_PCT[i + 1]}`,
)

/**
 * Part écrite comme sur la carte : une décimale, comme /france (règle des décimales du 2026-10-05), sans jamais franchir
 * une borne de la légende à l'arrondi (9,97 % ne s'écrit pas « 10,0 % », qui la rangerait dans « 10–20 »).
 */
export function pctCarte(part: number): string {
  const v = part * 100
  return `${sansFranchir(v, BORNES_PCT.slice(1), (d) => fmt.dec(v, d), 1, true)}${NBSP}%`
}

/**
 * Restrictions de consommation (demande de l'auteur, 24/09) : part des réseaux sous restriction de consommation ou
 * consigne d'ébullition de l'ARS dans l'année, classe « restriction ou consigne » de toutes familles
 * (pipeline/robinet/situations.py). Plus de la moitié des départements n'en comptent aucun et le neuvième décile est
 * vers 8 % (2023-2025) : paliers propres, « aucun réseau » puis 2, 5 et 10 %, sans quoi presque tout tombait dans la
 * teinte la plus claire des parts non conformes (5, 10, 20, 40 %).
 */
export const BORNES_RESTRICTIONS = [0, 1e-6, 0.02, 0.05, 0.1]
export const ETIQUETTES_RESTRICTIONS = ['aucun réseau', `< 2${NBSP}%`, `2${NBSP}%–5${NBSP}%`, `5${NBSP}%–10${NBSP}%`, `≥ 10${NBSP}%`]

/** Part des réseaux sous restriction ou consigne ; null sans réseau analysé. */
export function partRestrictions(r: Repartition | undefined): number | null {
  if (!r) return null
  const t = reseauxAnalyses(r)
  return t ? r[2] / t : null
}

/** Part écrite sans franchir une borne de la légende des restrictions (1,996 % ne s'écrit pas « 2,0 % »). */
export function pctRestrictions(part: number): string {
  const v = part * 100
  return `${sansFranchir(v, [2, 5, 10], (d) => fmt.dec(v, d), 1, true)}${NBSP}%`
}

/** Familles en restriction ou consigne dans le code de situation d'une commune : « pesticides, bactériologie ». */
export function causesRestriction(code: string | null | undefined): string[] {
  if (!code) return []
  return FAMILLES_SITU.filter((f, i) => code[i] != null && code[i] !== '-' && enRestriction(f, Number(code[i]))).map((f) => NOMS_FAMILLES[f])
}

export interface LigneDepartement {
  code: string
  nom: string
  /** part des réseaux non conformes ; null sans réseau analysé */
  part: number | null
  nonConformes: number
  analyses: number
}

/**
 * Lignes du tableau des départements, une par département du dessin, même sans donnée : de la plus forte part
 * à la plus faible, puis par nom ; les départements sans réseau analysé en dernier.
 */
export function lignesDepartements(
  depts: Record<string, Partial<Record<FamilleSitu, Repartition>>>,
  noms: Record<string, string>,
  famille: FamilleSitu = 'toutes',
): LigneDepartement[] {
  return Object.entries(noms)
    .map(([code, nom]) => {
      const r = depts[code]?.[famille]
      return { code, nom, part: partNonConformes(r, famille), nonConformes: r ? nonConformes(r, famille) : 0, analyses: r ? reseauxAnalyses(r) : 0 }
    })
    .sort((a, b) => (b.part ?? -1) - (a.part ?? -1) || a.nom.localeCompare(b.nom, 'fr'))
}

/**
 * Nom d'étiquette sur deux lignes quand il est long, coupé au trait d'union ou à l'espace qui rend la plus longue
 * ligne la plus courte (« Alpes-de- / Haute-Provence », « Territoire / de Belfort ») ; le trait d'union reste en fin
 * de première ligne.
 */
export function lignesEtiquette(nom: string, max = 13): string[] {
  if (nom.length <= max) return [nom]
  let coupe = -1
  let pire = Infinity
  for (let i = 1; i < nom.length - 1; i++) {
    if (nom[i] !== '-' && nom[i] !== ' ') continue
    const longueur = Math.max(nom[i] === '-' ? i + 1 : i, nom.length - i - 1)
    if (longueur < pire) {
      pire = longueur
      coupe = i
    }
  }
  if (coupe < 0) return [nom]
  return nom[coupe] === '-' ? [nom.slice(0, coupe + 1), nom.slice(coupe + 1)] : [nom.slice(0, coupe), nom.slice(coupe + 1)]
}

export interface BoiteEtiquette {
  code: string
  x: number
  y: number
  w: number
  h: number
  /** le plus grand département d'abord, comme la carte MapLibre (symbol-sort-key sur l'aire) */
  priorite: number
}

/**
 * Étiquettes qui tiennent sans se chevaucher (écart `marge` compris), posées par priorité décroissante ; avec un
 * `cadre`, celles qui en sortiraient sont écartées (le dessin les rognerait).
 */
export function etiquettesVisibles(boites: readonly BoiteEtiquette[], marge = 0, cadre?: { largeur: number; hauteur: number }): Set<string> {
  const posees: BoiteEtiquette[] = []
  const visibles = new Set<string>()
  const dedans = (b: BoiteEtiquette) => !cadre || (b.x >= 0 && b.y >= 0 && b.x + b.w <= cadre.largeur && b.y + b.h <= cadre.hauteur)
  for (const b of [...boites].filter(dedans).sort((a, c) => c.priorite - a.priorite)) {
    const touche = posees.some((p) => b.x < p.x + p.w + marge && p.x < b.x + b.w + marge && b.y < p.y + p.h + marge && p.y < b.y + b.h + marge)
    if (touche) continue
    posees.push(b)
    visibles.add(b.code)
  }
  return visibles
}

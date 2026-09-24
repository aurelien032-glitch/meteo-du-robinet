import { fmt } from './data'
import { NBSP, sansFranchir } from './instruments'
import { PALIERS_ARDOISE, palierArdoise } from './scale'
import { nonConformes, partNonConformes, reseauxAnalyses, type FamilleSitu, type Repartition } from './situations'

/**
 * Carte des départements de l'accueil (maquette du 23/09) : part des réseaux non conformes sur la rampe ardoise
 * (PALIERS_ARDOISE, lib/scale.ts), avec sa légende, sa lecture et son tableau. Le dessin vient du pipeline
 * (geo/departements-svg.json) ; ici, ce qui se calcule.
 */

/** Classe de la rampe (1 à 5, jetons --m1…--m5) ; 0 sans réseau analysé, dessiné hachuré. */
export function classeArdoise(part: number | null | undefined): number {
  return part == null ? 0 : palierArdoise(part) + 1
}

const BORNES_PCT = PALIERS_ARDOISE.map((b) => Math.round(b * 100))

/** Étiquettes de la légende, en % : « < 5 », « 5–10 », « 10–20 », « 20–40 », « ≥ 40 ». */
export const ETIQUETTES_ARDOISE = BORNES_PCT.map((b, i) =>
  i === 0 ? `< ${BORNES_PCT[1]}` : i === BORNES_PCT.length - 1 ? `≥ ${b}` : `${b}–${BORNES_PCT[i + 1]}`,
)

/**
 * Part écrite comme sur la carte : une décimale sous 10 %, aucune au-delà, sans jamais franchir une borne de la
 * légende à l'arrondi (9,97 % ne s'écrit pas « 10,0 % », qui la rangerait dans « 10–20 »).
 */
export function pctCarte(part: number): string {
  const v = part * 100
  return `${sansFranchir(v, BORNES_PCT.slice(1), (d) => fmt.dec(v, d), v < 10 ? 1 : 0, true)}${NBSP}%`
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

/** Lecture d'un département ou de la France : « Marne : 60 % des réseaux non conformes, 187 sur 314 analysés ». */
export function lectureDepartement(l: Pick<LigneDepartement, 'nom' | 'part' | 'nonConformes' | 'analyses'>): string {
  if (l.part == null) return `${l.nom} : aucun réseau analysé`
  return `${l.nom} : ${pctCarte(l.part)} des réseaux non conformes, ${fmt.int(l.nonConformes)} sur ${fmt.int(l.analyses)} analysé${l.analyses > 1 ? 's' : ''}`
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

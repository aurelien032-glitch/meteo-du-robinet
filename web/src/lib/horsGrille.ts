import { fmt } from './data'
import type { HgGroupe } from './types'

/** Groupes de substances sans limite de qualité, dans l'ordre de la page /hors-grille et de la fiche département. */
export const GROUPES_HG: HgGroupe[] = ['perchlorate', 'tfa', 'metabolites', 'pfas', 'haloacetiques', 'autres']

/** Groupe lu dans l'adresse (`?groupe=`), null s'il n'en est pas un. */
export function groupeHg(v: string | null): HgGroupe | null {
  return GROUPES_HG.find((g) => g === v) ?? null
}

/** Part en % ; une part non nulle mais inférieure à 1 % s'écrit « moins de 1 % », jamais « 0 % ». */
export function part100(num: number, den: number, court = false): string {
  if (!den) return '–'
  const p = (100 * num) / den
  return p > 0 && p < 1 ? (court ? '< 1 %' : 'moins de 1 %') : fmt.pct(p, 0)
}

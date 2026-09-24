import { div } from './theme'

/**
 * Classes de niveau des nappes, de « très bas » à « très haut » : palette divergente neutre (règle « neutre
 * partout », 24/09), ocre grisé du côté sec, gris au centre, ardoise du côté haut. Un niveau de nappe est un
 * contexte, pas un jugement sur l'eau du robinet : l'ancien rouge (RdBu) le présentait comme une alerte.
 */
export function couleursClasses(): string[] {
  return [...div()].reverse()
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « 2026-08 » → « août 2026 ». */
export function moisFr(m: string): string {
  return `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
}

/** Parts de piézomètres sous la normale (très bas, bas, modérément bas) parmi ceux classés ce mois-là. */
export function partSous(c: number[] | undefined): number | null {
  if (!c) return null
  const tot = c.reduce((a, b) => a + b, 0)
  return tot ? (c[0] + c[1] + c[2]) / tot : null
}

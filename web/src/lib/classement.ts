import type { SituationsFile } from './situations'
import { deptCode } from './types'

/**
 * Classements des départements par part (relecture du 25/09, seuil fixé le 26/09 sur les données) : une part calculée
 * sur un ou deux réseaux mettait en tête un département dont presque rien n'avait été mesuré — la Haute-Loire en
 * radioactivité 2025 (« 1 sur 1 » : un seul réseau analysé, sur 369), l'Aude en PFAS 2024 (2 réseaux, sur 541).
 * Une part n'est classée que si elle repose sur au moins EFFECTIF_MIN unités (réseaux, analyses ou prélèvements), ou
 * sur toutes celles du département : Paris (4 réseaux), les Hauts-de-Seine (6) et le Val-de-Marne (9) restent classés,
 * tous leurs réseaux étant analysés. Les autres gardent leur couleur sur la carte et leur effectif dans l'info-bulle ;
 * les classements les mettent à part, et le disent.
 */
export const EFFECTIF_MIN = 10

/** Vrai si une part calculée sur `n` unités, parmi les `total` que compte le département (s'il est connu), se classe. */
export function classable(n: number, total?: number | null): boolean {
  return n >= EFFECTIF_MIN || (total != null && n > 0 && n >= total)
}

/** Réseaux de chaque département dans un fichier de situations, c'est-à-dire analysés pour au moins une famille. */
export function reseauxParDept(situ: SituationsFile | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const code of Object.keys(situ?.reseaux ?? {})) {
    const d = deptCode(code.slice(0, 3))
    m.set(d, (m.get(d) ?? 0) + 1)
  }
  return m
}

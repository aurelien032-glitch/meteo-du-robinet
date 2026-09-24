import { fmt } from './data'
import { codeFamille } from './situations'
import type { DeptFile, ReseauInfo } from './types'

/**
 * Fiche service (pages/Service.tsx). La SISPEA rattache des COMMUNES à un service ; le contrôle sanitaire
 * mesure des RÉSEAUX, et un prélèvement d'un réseau vaut pour toutes les communes qu'il dessert. Additionner
 * les chiffres commune par commune comptait donc un même prélèvement autant de fois que son réseau dessert
 * de communes du service (de ×2 à ×9,4 sur quatre services vérifiés le 23/09 : 3 692 prélèvements affichés
 * au SIECT pour 391 sur ses 7 réseaux). Tout se compte ici par réseau, chaque réseau une seule fois.
 *
 * Limite connue, laissée à la décision de l'auteur : SISE-Eaux rattache un prélèvement fait sur un réseau
 * amont (colonne cdreseauamont) à chacun des réseaux qu'il alimente. Deux réseaux d'un même service peuvent
 * donc partager des prélèvements, que la somme par réseau compte deux fois (130 des 261 prélèvements
 * distincts du SIECT en 2025) ; seul le pipeline, qui voit les références des prélèvements, peut les
 * dédoublonner.
 */

/** Un réseau qui dessert au moins une commune du service l'année considérée. */
export interface ReseauDuService {
  code: string
  info: ReseauInfo
  /** communes du service qu'il dessert cette année-là */
  communes: string[]
}

/**
 * Départements dont il faut charger le fichier : ceux des communes du service. Un réseau n'est décrit que
 * dans le fichier de son département, et 204 services sur 10 465 ont des communes dans plusieurs
 * départements ; ne lire que le département du service laissait de côté les réseaux des autres.
 * `deptDe` : commune → département, d'après l'index des communes (communes.json) ; une commune absente de
 * l'index n'a pas de données du contrôle sanitaire et ne demande aucun fichier.
 */
export function deptsDuService(communes: readonly string[], deptDe: ReadonlyMap<string, string>): string[] {
  const depts = new Set<string>()
  for (const c of communes) {
    const d = deptDe.get(c)
    if (d) depts.add(d)
  }
  return [...depts].sort()
}

/** Réseaux qui desservent les communes du service l'année `annee`, chacun une seule fois. */
export function reseauxDuService(communes: readonly string[], fichiers: readonly DeptFile[], annee: string): ReseauDuService[] {
  const parCode = new Map<string, ReseauDuService>()
  for (const c of communes)
    for (const f of fichiers)
      for (const code of f.communes[c]?.reseaux[annee] ?? []) {
        const info = f.reseaux[code]
        if (!info) continue
        let r = parCode.get(code)
        if (!r) parCode.set(code, (r = { code, info, communes: [] }))
        if (!r.communes.includes(c)) r.communes.push(c)
      }
  return [...parCode.values()]
}

export interface TotauxControle {
  plv: number
  ncBact: number
  neBact: number
  ncChim: number
  neChim: number
  /** réseaux qui ont au moins un prélèvement dans l'année */
  reseauxAvecPlv: number
}

/** Prélèvements du contrôle sanitaire sur les réseaux du service, sommés réseau par réseau. */
export function totauxReseaux(reseaux: readonly ReseauDuService[], annee: string): TotauxControle {
  const t: TotauxControle = { plv: 0, ncBact: 0, neBact: 0, ncChim: 0, neChim: 0, reseauxAvecPlv: 0 }
  for (const r of reseaux) {
    const p = r.info.stats?.[annee]?.plv
    if (!p) continue
    t.plv += p[0]
    t.ncBact += p[1]
    t.neBact += p[2]
    t.ncChim += p[3]
    t.neChim += p[4]
    if (p[0] > 0) t.reseauxAvecPlv++
  }
  return t
}

/** Réseaux analysés dans l'année, non conformes pour au moins une famille, et sous restriction ou consigne. */
export interface CompteSituations {
  n: number
  nc: number
  restr: number
}

/** Compte des réseaux par situation, au sens des bilans officiels (codeFamille, lib/situations.ts). */
export function compteSituations(codes: readonly (string | null | undefined)[]): CompteSituations {
  const t: CompteSituations = { n: 0, nc: 0, restr: 0 }
  for (const c of codes) {
    const v = codeFamille(c, 'toutes')
    if (v == null) continue
    t.n++
    if (v > 0) t.nc++
    if (v === 2) t.restr++
  }
  return t
}

/** L'agrégat en une phrase, sans couleur de jugement : la couleur reste aux réseaux, un par un. */
export function phraseAgregat({ n, nc, restr }: CompteSituations): string {
  if (n === 0) return 'Aucun réseau analysé'
  if (n === 1)
    return nc === 0
      ? 'Le réseau analysé est conforme aux limites réglementaires'
      : restr
        ? 'Le réseau analysé est sous restriction ou consigne'
        : 'Le réseau analysé est non conforme pour au moins une famille'
  if (nc === 0) return `Les ${fmt.int(n)} réseaux analysés sont conformes aux limites réglementaires`
  return `${fmt.nb(nc, 'réseau non conforme', 'réseaux non conformes')} sur ${fmt.int(n)}${restr ? `, dont ${fmt.int(restr)} sous restriction ou consigne` : ''}`
}

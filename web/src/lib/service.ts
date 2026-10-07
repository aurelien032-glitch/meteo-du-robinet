import { ligneBilan } from './bilan'
import { fmt } from './data'
import { nomCompletReseau, nomLisibleReseau } from './nomsReseaux'
import { renseigne } from './sispea'
import { classeArs, codeFamille, situationReseau, toneSituation, type LettreArs, type SituationsFile, type Ton } from './situations'
import type { DeptFile, ReseauInfo, SispeaNationalFile, SispeaServicesIndex, SispeaYear } from './types'

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

/**
 * Où lire la fiche d'un service : l'index (sispea/services-index.json) donne son département, dont le fichier
 * (sispea/services/<dd>.json) porte la fiche. Vérification du 27/09 : trois services présents dans l'index sans
 * département (351134, CA Privas Centre Ardèche, que la recherche propose) laissaient la page en chargement, le
 * fichier n'étant jamais demandé. Chaque issue a désormais sa réponse ; `nom` : collectivité, à défaut entité, si
 * l'index la connaît.
 */
export type RoutageService =
  | { etat: 'attente' }
  | { etat: 'inconnu' }
  | { etat: 'sans-departement'; nom: string | null }
  | { etat: 'fichier'; chemin: string }

export function routageService(index: SispeaServicesIndex | null | undefined, id: string): RoutageService {
  if (!index) return { etat: 'attente' }
  // hasOwn : « /service/constructor » ne doit pas trouver une méthode d'Object dans l'index.
  const e = Object.hasOwn(index, id) ? index[id] : undefined
  if (!e) return { etat: 'inconnu' }
  return e[1] ? { etat: 'fichier', chemin: `sispea/services/${e[1]}.json` } : { etat: 'sans-departement', nom: e[0] ?? e[4] }
}

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

/**
 * Compte des réseaux par situation, au sens des bilans officiels (codeFamille, lib/situations.ts).
 */
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

/**
 * Ton du voyant d'un agrégat (choix de l'auteur du 04/10, « la palette couleur partout ») : celui du réseau le plus
 * défavorable, comme la carte communale (restriction ou consigne, sinon non conforme, sinon conforme) ; null sans réseau
 * analysé. La phrase qui l'accompagne (phraseAgregat) dit les nombres.
 */
export function tonAgregat({ n, nc, restr }: CompteSituations): Ton | null {
  if (n === 0) return null
  return toneSituation('toutes', restr ? 2 : nc ? 1 : 0)
}

/** L'agrégat en une phrase ; son voyant prend le ton du réseau le plus défavorable (tonAgregat). */
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

/** Indicateurs SISPEA de la fiche service, face à la médiane France (clé de sispea/national.json). */
export const INDICATEURS_SERVICE: { code: string; label: string; unit: string; nat: keyof Pick<SispeaYear, 'prix' | 'rend' | 'ilp' | 'renouv' | 'cbact' | 'cchim' | 'patrim' | 'impayes'> }[] = [
  { code: 'D102.0', label: 'Prix TTC du m³ (120 m³/an)', unit: '€', nat: 'prix' },
  { code: 'P104.3', label: 'Rendement du réseau', unit: '%', nat: 'rend' },
  { code: 'P106.3', label: 'Pertes en réseau', unit: 'm³/km/j', nat: 'ilp' },
  { code: 'P107.2', label: 'Renouvellement annuel', unit: '%', nat: 'renouv' },
  { code: 'P101.1', label: 'Conformité microbiologique déclarée', unit: '%', nat: 'cbact' },
  { code: 'P102.1', label: 'Conformité physico-chimique déclarée', unit: '%', nat: 'cchim' },
  { code: 'P103.2B', label: 'Connaissance du patrimoine', unit: '/120', nat: 'patrim' },
  { code: 'P154.0', label: 'Taux d’impayés', unit: '%', nat: 'impayes' },
]

/**
 * Millésime national auquel comparer un service : le sien, s'il est assez déclaré (au moins 3 000 services avec un
 * prix, même garde que la page Services), sinon le dernier qui l'est, plutôt que la poignée de déclarants précoces
 * d'une année neuve.
 */
export function anneeMediane(nat: SispeaNationalFile, anneeInd: number | null | undefined): string | undefined {
  const annees = Object.keys(nat.annees).filter((a) => (nat.annees[a].prix.n ?? 0) >= 3000).sort()
  const a = anneeInd ? String(anneeInd) : undefined
  return a && annees.includes(a) ? a : annees[annees.length - 1]
}

/** Ligne de la liste « Ses réseaux en {année} » : nom, distributeur, situation de l'année. */
export interface LigneReseauService {
  r: ReseauDuService
  /** nom lisible (lib/nomsReseaux) */
  nom: string
  dist: string | null
  s: ReturnType<typeof situationReseau>
  /** note A–D calculée par le site (classeArs), null sans note */
  lettre: LettreArs | null
  /** cause courte de la note, celle du bilan des fiches (ligneBilan) */
  cause: string
}

/**
 * Réseaux d'un service, de la note la plus défavorable à la plus favorable, les réseaux sans note en dernier (refonte du
 * 2026-10-05 : la note A–D de chaque réseau, comme les fiches commune et réseau, et non plus « non conforme » dès un
 * dépassement).
 */
export function lignesReseauxService(
  reseaux: readonly ReseauDuService[],
  situ: SituationsFile,
  annee: string,
  /** code INSEE → nom officiel : la commune de tête du nom d'un réseau sous sa forme officielle (nomCompletReseau) */
  noms?: ReadonlyMap<string, string>,
): LigneReseauService[] {
  return reseaux
    .map((r) => {
      const nom = (noms ? nomCompletReseau(r.info.nom, r.communes.map((c) => noms.get(c) ?? c)) : nomLisibleReseau(r.info.nom)) || r.code
      const b = ligneBilan({ code: r.code, nom, situation: situ.reseaux[r.code] ?? null, ars: classeArs(situ, r.code) }, annee)
      return { r, nom, dist: renseigne(r.info.dist), s: situationReseau(situ.reseaux[r.code], annee), lettre: b.lettre, cause: b.cause }
    })
    .sort((a, b) => (b.lettre ?? '').localeCompare(a.lettre ?? '') || a.nom.localeCompare(b.nom, 'fr'))
}

/** Les notes des réseaux d'un service en une phrase : « 12 réseaux notés C et 1 réseau noté A ». */
export function phraseNotesReseaux(lignes: readonly Pick<LigneReseauService, 'lettre'>[]): string {
  const parts: string[] = []
  for (const l of ['D', 'C', 'B', 'A'] as const) {
    const n = lignes.filter((x) => x.lettre === l).length
    if (n) parts.push(`${fmt.int(n)} ${n > 1 ? 'réseaux notés' : 'réseau noté'} ${l}`)
  }
  const sans = lignes.filter((x) => !x.lettre).length
  if (sans) parts.push(`${fmt.int(sans)} ${sans > 1 ? 'réseaux' : 'réseau'} sans note`)
  if (!parts.length) return 'Aucun réseau'
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0]
}

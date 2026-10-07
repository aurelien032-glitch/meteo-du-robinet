import { nomLisibleReseau } from './nomsReseaux'
import { relireCodes } from './recherche'
import { classeArs, classesNonConformes, codeFamille, type FamilleSitu, type LettreArs, type SituationsFile } from './situations'
import { deptCode, type DeptFile } from './types'

/**
 * Réseaux concernés d'un département (choix de l'auteur, 24/09 : des réseaux, pas des communes, comme le veut la règle
 * du projet). Situation lue dans situations/<année>.json ; nom dans l'index des réseaux de la recherche, communes
 * desservies dans le fichier du département.
 */

/** Index des réseaux de la recherche (recherche/reseaux.json, pipeline/robinet/recherche.py) : codes en écarts, noms, communes. */
export interface IndexReseaux {
  c: (string | number)[]
  n: string[]
  k: number[]
}

export type Critere = FamilleSitu | 'restriction'

/** Communes desservies par chaque réseau d'un département dans l'année (dept/<dd>.json), noms officiels de préférence. */
function communesDesReseaux(dept: DeptFile | null | undefined, annee: string | number, nomsCommunes?: ReadonlyMap<string, string>): Map<string, string[]> {
  const communes = new Map<string, string[]>()
  for (const [insee, c] of Object.entries(dept?.communes ?? {})) {
    const nom = nomsCommunes?.get(insee) ?? c.nom
    for (const r of c.reseaux[String(annee)] ?? []) {
      const l = communes.get(r)
      if (l) l.push(nom)
      else communes.set(r, [nom])
    }
  }
  return communes
}

/** Réseau concerné d'une famille, avec les communes qu'il dessert dans l'année (pages de sujets, lot 4). */
export interface ReseauFamille {
  code: string
  nom: string
  /** classe de la famille (lib/situations.ts), ou 2 pour une restriction ou une consigne */
  classe: number
  /** noms des communes desservies dans l'année, dans l'ordre alphabétique */
  communes: string[]
}

/**
 * Réseaux concernés d'un département (refonte, lot 4 : pages de sujets, fiche département, vue communale de /carte) : non
 * conformes au sens du bilan de la famille (nitrates dès 40 mg/L, comme la carte), ou sous restriction ou consigne de
 * l'ARS pour le critère « restriction ». Par ordre alphabétique de la première commune desservie, puis du nom du réseau,
 * comme la tête de la fiche département : une liste, jamais un ordre de gravité ni de taille. `analyses` : réseaux du
 * département analysés pour ce critère.
 */
export function reseauxFamilleAlpha(
  situ: SituationsFile,
  index: IndexReseaux | null | undefined,
  dept: DeptFile | null | undefined,
  dd: string,
  annee: string | number,
  critere: Critere,
  nomsCommunes?: ReadonlyMap<string, string>,
): { lignes: ReseauFamille[]; analyses: number } {
  const fam: FamilleSitu = critere === 'restriction' ? 'toutes' : critere
  const noms = new Map<string, string>()
  if (index) relireCodes(index.c).forEach((c, i) => noms.set(c, index.n[i]))
  const communes = communesDesReseaux(dept, annee, nomsCommunes)
  const lignes: ReseauFamille[] = []
  let analyses = 0
  for (const [code, s] of Object.entries(situ.reseaux)) {
    if (deptCode(code.slice(0, 3)) !== dd) continue
    const c = codeFamille(s, fam)
    if (c == null) continue
    analyses++
    if (!(critere === 'restriction' ? c === 2 : critere === 'azote' ? c >= 2 : classesNonConformes(critere).includes(c))) continue
    const brut = noms.get(code)?.trim() || dept?.reseaux[code]?.nom?.trim() || ''
    lignes.push({ code, nom: nomLisibleReseau(brut) || code, classe: c, communes: [...new Set(communes.get(code) ?? [])].sort(alpha) })
  }
  lignes.sort((a, b) => alpha(a.communes[0] ?? '￿', b.communes[0] ?? '￿') || alpha(a.nom, b.nom) || a.code.localeCompare(b.code))
  return { lignes, analyses }
}

/** Réseau d'un département classé C ou D, avec les communes qu'il dessert dans l'année. */
export interface ReseauClasse {
  code: string
  nom: string
  lettre: Extract<LettreArs, 'C' | 'D'>
  /** noms des communes desservies dans l'année, dans l'ordre alphabétique */
  communes: string[]
}

const alpha = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' })

/**
 * Réseaux du département classés C ou D dans l'année (refonte, lot 3 : tête de la fiche département), par ordre
 * alphabétique de la première commune desservie, puis du nom du réseau : une liste, pas un palmarès (prudence juridique,
 * choix de l'auteur du 2026-10-05). `classes` : réseaux du département dont la classe est calculée. Communes lues dans
 * dept/<dd>.json (réseaux de chaque commune par année) ; nom lisible du réseau (lib/nomsReseaux.ts) tiré de l'index de la
 * recherche, sinon du fichier du département.
 */
export function reseauxClassesCD(
  situ: SituationsFile,
  index: IndexReseaux | null | undefined,
  dept: DeptFile | null | undefined,
  dd: string,
  annee: string | number,
  /** noms officiels des communes (communes.json) ; à défaut, ceux du fichier du département, en capitales */
  nomsCommunes?: ReadonlyMap<string, string>,
): { lignes: ReseauClasse[]; classes: number } {
  const noms = new Map<string, string>()
  if (index) relireCodes(index.c).forEach((c, i) => noms.set(c, index.n[i]))
  const communes = communesDesReseaux(dept, annee, nomsCommunes)
  const lignes: ReseauClasse[] = []
  let classes = 0
  for (const code of Object.keys(situ.reseaux)) {
    if (deptCode(code.slice(0, 3)) !== dd) continue
    const l = classeArs(situ, code)?.classe
    if (!l) continue
    classes++
    if (l !== 'C' && l !== 'D') continue
    const brut = noms.get(code)?.trim() || dept?.reseaux[code]?.nom?.trim() || ''
    lignes.push({ code, nom: nomLisibleReseau(brut) || code, lettre: l, communes: [...new Set(communes.get(code) ?? [])].sort(alpha) })
  }
  lignes.sort((a, b) => alpha(a.communes[0] ?? '￿', b.communes[0] ?? '￿') || alpha(a.nom, b.nom) || a.code.localeCompare(b.code))
  return { lignes, classes }
}

import { fmt } from './data'
import { moisFr } from './nappes'
import type { AmontDeptFile, NappesDept, NappesNational } from './types'

/**
 * La ressource autour d'une commune, pour la bande « La ressource, aujourd'hui » de sa fiche (maquette du 23/09) :
 * contexte daté, sans jugement de conformité, qui ne suit pas l'année du contrôle sanitaire. Mêmes calculs que les
 * cartes du détail (OrigineCard, NappeCard), qui en donnent le tableau et la courbe.
 */

/** Ouvrages de prélèvement pour l'eau potable sur la commune (BNPE) et volume de leur dernière année déclarée. */
export interface OrigineCommune {
  ouvrages: number
  /** dernière année déclarée par au moins un ouvrage */
  annee: string | null
  /** volume prélevé cette année-là par les ouvrages qui l'ont déclarée (m³) */
  volume: number
  declares: number
}

export function origineCommune(f: AmontDeptFile, insee: string): OrigineCommune {
  const ouvrages = Object.values(f.ouvrages).filter((o) => o.commune === insee)
  // Une seule année : additionner le dernier volume de chaque ouvrage mêlerait des millésimes sous une même date.
  const annee = ouvrages.flatMap((o) => Object.keys(o.volumes)).sort().pop() ?? null
  const declares = annee ? ouvrages.filter((o) => o.volumes[annee] != null) : []
  return { ouvrages: ouvrages.length, annee, volume: declares.reduce((a, o) => a + (o.volumes[annee!] ?? 0), 0), declares: declares.length }
}

export function phraseOrigine(o: OrigineCommune): string {
  if (!o.ouvrages) return 'Aucun ouvrage de prélèvement pour l’eau potable sur la commune : l’eau vient d’ailleurs, par le réseau.'
  const n = `${fmt.nb(o.ouvrages, 'ouvrage')} de prélèvement pour l’eau potable sur la commune`
  if (!o.annee) return `${n}.`
  const par = o.declares >= o.ouvrages ? '' : o.declares === 1 ? ' par le seul ouvrage déclaré cette année-là' : ` par les ${o.declares} ouvrages déclarés cette année-là`
  return `${n}, ${fmt.int(o.volume)} m³ prélevés en ${o.annee}${par}.`
}

/**
 * « de » devant un nom de lieu, élidé ou contracté : « d’Anneville-en-Saire », « du Havre », « des Sables-d’Olonne »,
 * « de Saint-Grégoire ». Devant un h, « de » : rien dans le nom ne dit s'il est muet (Honfleur) ou aspiré (Haguenau).
 */
export function deLieu(nom: string): [string, string] {
  if (/^Le /.test(nom)) return ['du ', nom.slice(3)]
  if (/^Les /.test(nom)) return ['des ', nom.slice(4)]
  if (/^[AEIOUYÂÉÈÊÎÔŒaeiouyâéèêîôœ]/.test(nom)) return ['d’', nom]
  return ['de ', nom]
}

/** Au-delà, le piézomètre le plus proche ne dit plus grand-chose de la nappe sous la commune. */
export const DISTANCE_MAX_KM = 40

/** Nappe suivie la plus proche : son niveau du dernier mois complet, classé parmi les mêmes mois passés. */
export interface NappeCommune {
  code: string
  commune: string | null
  nappe: string | null
  distance: number
  /** indice dans `NappesNational.classes` (très bas … très haut) ; null sans mesure exploitable ce mois-là */
  classe: number | null
  mois: string
  depuis: string | null
}

export function nappeCommune(nat: NappesNational, nd: NappesDept, insee: string): NappeCommune | null {
  const proche = nd.communes[insee]
  if (!proche || proche[1] > DISTANCE_MAX_KM) return null
  const p = nd.piezometres[proche[0]]
  if (!p) return null
  return { code: proche[0], commune: p.commune, nappe: p.nappe, distance: proche[1], classe: p.classes[nat.mois_ref] ?? null, mois: nat.mois_ref, depuis: p.debut?.slice(0, 4) ?? null }
}

export function phraseNappe(n: NappeCommune, classes: readonly string[]): string {
  const ou = `Piézomètre ${deLieu(n.commune ?? n.code).join('')} (${fmt.dec(n.distance, 0)} km)${n.nappe ? `, ${n.nappe}` : ''}`
  if (n.classe == null) return `${ou} : pas de mesure exploitable en ${moisFr(n.mois)}.`
  return `${ou} : niveau ${classes[n.classe]} en ${moisFr(n.mois)}, par rapport aux mêmes mois${n.depuis ? ` depuis ${n.depuis}` : ''}.`
}

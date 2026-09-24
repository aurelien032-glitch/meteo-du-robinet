import type { RessourceDept, RessourceFile } from './types'

export type IndicRessource =
  | 'part_zre'
  | 'prel_evol'
  | 'pertes_pct'
  | 'conso_l_hab_j'
  | 'protection_moy'
  | 'nappes_basses'
  | 'nappes_sous_normale_12m'
  | 'jours_crise_ar'
  | 'jours_crise_ar_5ans'
  | 'part_nappe'

/**
 * Indicateurs de pression sur la ressource, un par un (pas de score composite). `pire` : sens dans lequel la valeur
 * signale une pression plus forte (null : descriptif). `annee` : millésime de la source, pour le libellé.
 */
export const INDICS_RESSOURCE: {
  key: IndicRessource
  label: string
  court: string
  unit: string
  pire: 'haut' | 'bas' | null
  dec: number
  annee: (n: RessourceFile['national']) => string
  /** Bornes rondes fixes des paliers de la carte (revue du 2026-09-22), calées sur la distribution départementale. */
  paliers: number[]
  /** Premier palier ouvert vers le bas (« < 120 »). */
  ouvertBas?: boolean
  /** Palette divergente centrée sur zéro (évolution). */
  divergent?: boolean
}[] = [
  { key: 'part_zre', label: "Part des prélèvements d'eau potable en zone de répartition des eaux", court: 'en ZRE', unit: '%', pire: 'haut', dec: 0, annee: (n) => String(n.annee_bnpe), paliers: [0, 1, 10, 25, 50, 75, 90] },
  { key: 'prel_evol', label: "Évolution des prélèvements d'eau potable sur cinq ans (moyennes de trois ans)", court: 'évol. 5 ans', unit: '%', pire: 'haut', dec: 1, annee: (n) => `${n.annee_bnpe_ref}-${n.annee_bnpe}`, paliers: [-99, -10, -5, -2, 2, 5, 10], divergent: true },
  { key: 'pertes_pct', label: "Part de l'eau mise en distribution perdue en fuites", court: 'fuites', unit: '%', pire: 'haut', dec: 1, annee: (n) => String(n.annee_sispea), paliers: [0, 15, 20, 25, 30, 40], ouvertBas: true },
  { key: 'conso_l_hab_j', label: 'Consommation domestique par habitant', court: 'L/hab/j', unit: 'L/hab/j', pire: 'haut', dec: 0, annee: (n) => String(n.annee_sispea), paliers: [0, 120, 135, 150, 175, 200], ouvertBas: true },
  { key: 'protection_moy', label: 'Avancement de la protection des captages (moyenne des services)', court: 'protection', unit: '%', pire: 'bas', dec: 0, annee: (n) => String(n.annee_sispea), paliers: [0, 60, 70, 75, 80, 90], ouvertBas: true },
  { key: 'nappes_basses', label: 'Piézomètres « bas » ou « très bas »', court: 'nappes basses', unit: '%', pire: 'haut', dec: 0, annee: (n) => n.mois_nappes, paliers: [0, 10, 25, 40, 60, 80] },
  { key: 'nappes_sous_normale_12m', label: 'Nappes sous la normale, moyenne des douze derniers mois', court: 'sous normale 12 mois', unit: '%', pire: 'haut', dec: 0, annee: (n) => `12 mois à ${n.mois_nappes}`, paliers: [0, 10, 25, 40, 55, 70] },
  { key: 'jours_crise_ar', label: 'Jours en alerte renforcée ou en crise sécheresse', court: 'jours restr.', unit: 'jours', pire: 'haut', dec: 0, annee: (n) => String(n.annee_secheresse), paliers: [0, 1, 30, 60, 120, 180] },
  { key: 'jours_crise_ar_5ans', label: 'Jours en alerte renforcée ou en crise, moyenne sur cinq ans', court: 'jours, moy. 5 ans', unit: 'jours', pire: 'haut', dec: 0, annee: (n) => `${n.annees_secheresse_5[0]}-${n.annees_secheresse_5[4]}`, paliers: [0, 10, 30, 60, 100, 150] },
  { key: 'part_nappe', label: "Part des prélèvements d'eau potable faits en nappe", court: 'en nappe', unit: '%', pire: null, dec: 0, annee: (n) => String(n.annee_bnpe), paliers: [0, 20, 40, 60, 80] },
]

/** Valeur formatée avec son unité ; les évolutions portent leur signe (« +7,5 % »). */
export function fmtRessource(i: (typeof INDICS_RESSOURCE)[number], v: number | null, avecUnite = true): string {
  if (v == null) return '–'
  const s = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: i.dec, maximumFractionDigits: i.dec, signDisplay: i.key === 'prel_evol' ? 'exceptZero' : 'auto' }).format(v)
  return avecUnite ? `${s}${i.unit === '%' ? ' %' : ` ${i.unit}`}` : s
}

export function valeurRessource(d: RessourceDept | undefined, k: IndicRessource): number | null {
  const v = d?.[k]
  return typeof v === 'number' ? v : null
}

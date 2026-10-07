import { PALIERS_PARTS } from './scale'
import type { AmontCroisementDept } from './types'

/**
 * Indicateurs de l'amont par département (croisement des sources, amont/national.json), pour /amont et /carte :
 * une seule définition, les paliers de couleur ne peuvent pas diverger d'une page à l'autre.
 */
export type IndicAmont = 'ventes' | 'robinet' | 'nitrates' | 'pesticides_nappes' | 'rivieres_nitrates' | 'rivieres_pesticides' | 'sout'
/**
 * `paliers` : bornes rondes fixes (décision de l'auteur, 2026-09-22), calées sur la distribution
 * départementale. « Au robinet » : part des RÉSEAUX non conformes aux pesticides (au moins une analyse
 * au-dessus de la limite dans l'année), la mesure et les paliers des pages Carte et Thème.
 */
export const INDICS_AMONT: { key: IndicAmont; label: string; unit: string; get: (d: AmontCroisementDept) => number | null; higherIsWorse: boolean | null; note?: string; paliers: number[] }[] = [
  { key: 'ventes', label: 'Substances phytopharmaceutiques vendues', unit: 't', get: (d) => (d.ventes_kg == null ? null : d.ventes_kg / 1000), higherIsWorse: true, note: 'total du département, non rapporté à sa surface agricole ; localisé au siège du distributeur', paliers: [0, 100, 250, 500, 1000, 2000, 3000] },
  { key: 'robinet', label: 'Réseaux non conformes aux pesticides au robinet', unit: '%', get: (d) => (d.robinet_part_reseaux == null ? null : 100 * d.robinet_part_reseaux), higherIsWorse: true, paliers: PALIERS_PARTS.map((x) => 100 * x) },
  { key: 'nitrates', label: 'Points de nappe au-dessus de 50 mg/L de nitrates', unit: '%', get: (d) => (d.nappes_nitrates_n ? (100 * (d.nappes_nitrates_sup50 ?? 0)) / d.nappes_nitrates_n : null), higherIsWorse: true, paliers: [0, 2, 5, 10, 20, 30] },
  { key: 'pesticides_nappes', label: 'Points de nappe au-dessus de 0,5 µg/L de pesticides', unit: '%', get: (d) => (d.nappes_pesticides_n ? (100 * (d.nappes_pesticides_sup ?? 0)) / d.nappes_pesticides_n : null), higherIsWorse: true, paliers: [0, 5, 10, 20, 40, 60] },
  { key: 'rivieres_nitrates', label: 'Stations de rivière au-dessus de 50 mg/L de nitrates', unit: '%', get: (d) => (d.rivieres_nitrates_n ? (100 * (d.rivieres_nitrates_sup ?? 0)) / d.rivieres_nitrates_n : null), higherIsWorse: true, paliers: [0, 2, 5, 10, 20, 30] },
  { key: 'rivieres_pesticides', label: 'Stations de rivière au-dessus de 5 µg/L de pesticides totaux', unit: '%', get: (d) => (d.rivieres_pesticides_n ? (100 * (d.rivieres_pesticides_sup ?? 0)) / d.rivieres_pesticides_n : null), higherIsWorse: true, paliers: [0, 1, 5, 10, 20, 30] },
  // Descriptif (ni bon ni mauvais) : rampe neutre.
  { key: 'sout', label: "Part de l'eau potable prélevée en nappe", unit: '%', get: (d) => (d.aep_part_sout == null ? null : 100 * d.aep_part_sout), higherIsWorse: null, paliers: [0, 20, 40, 60, 80] },
]

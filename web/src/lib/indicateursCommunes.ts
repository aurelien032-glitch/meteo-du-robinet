import { causesRestriction } from './carte'
import { fmt } from './data'
import { avisScale, restrictionScale, type Scale } from './scale'
import { codeFamille, libelleClasse, situationScale, type FamilleSitu } from './situations'
import { AVIS_PAR_CODE, AVIS_SANS_INFORMATION, communeDeRattachement, libelleAvisCarte, type MapFile, type MapRow } from './types'

/** Indicateurs de la qualité de l'eau qui ont une vue communale, sur /carte et sur la fiche département. */
export type IndicCommuneKey = 'pesticides' | 'azote' | 'pfas' | 'microbio' | 'metaux' | 'autres' | 'any' | 'restrictions' | 'avis'

export interface IndicateurCommune {
  key: IndicCommuneKey
  label: string
  /**
   * `situation` : situation du réseau le plus défavorable qui dessert la commune, au sens du bilan de la famille
   * (lib/situations.ts) ; `restriction` : commune desservie par un réseau sous restriction ou consigne de l'ARS ;
   * `avis` : avis sanitaire de l'ARS le plus grave de l'année (une consigne vise bien les habitants).
   */
  kind: 'situation' | 'restriction' | 'avis'
  fam?: FamilleSitu
  /** Légende de la carte communale. */
  descCommune: string
  /** Page de thème (/themes/…), null sans thème. */
  theme: string | null
}

/**
 * Une table pour /carte et la fiche département (mêmes indicateurs et mêmes clés, choix de l'auteur du 24/09) : la
 * carte communale colore la SITUATION du réseau le plus défavorable qui dessert chaque commune, à la manière des
 * bilans officiels (revue du 2026-09-22), jamais un binaire « dépassement ou non ».
 */
export const INDICS_COMMUNES: readonly IndicateurCommune[] = [
  { key: 'pesticides', label: 'Pesticides et métabolites', kind: 'situation', fam: 'pesticides', theme: 'pesticides', descCommune: 'situation pesticides du réseau le plus défavorable qui dessert la commune' },
  { key: 'azote', label: 'Nitrates', kind: 'situation', fam: 'azote', theme: 'nitrates', descCommune: 'situation nitrates du réseau le plus défavorable qui dessert la commune' },
  { key: 'pfas', label: 'PFAS', kind: 'situation', fam: 'pfas', theme: 'pfas', descCommune: 'situation PFAS du réseau le plus défavorable qui dessert la commune' },
  { key: 'microbio', label: 'Bactériologie', kind: 'situation', fam: 'microbio', theme: 'bacteries', descCommune: 'conformité bactériologique du réseau le plus défavorable qui dessert la commune' },
  { key: 'metaux', label: 'Métaux et minéraux', kind: 'situation', fam: 'metaux_mineraux', theme: 'metaux', descCommune: 'situation métaux et minéraux du réseau le plus défavorable qui dessert la commune' },
  // Sixième famille (03/10) : sans page de thème.
  { key: 'autres', label: 'Autres limites de qualité', kind: 'situation', fam: 'autres', theme: null, descCommune: 'situation des autres limites de qualité du réseau le plus défavorable qui dessert la commune' },
  { key: 'any', label: 'Toutes familles', kind: 'situation', fam: 'toutes', theme: null, descCommune: 'situation la plus défavorable des réseaux qui desservent la commune, toutes familles confondues' },
  {
    key: 'restrictions',
    label: 'Restrictions de consommation',
    kind: 'restriction',
    theme: null,
    descCommune: "commune desservie par un réseau sous restriction de consommation ou consigne d'ébullition de l'ARS dans l'année",
  },
  { key: 'avis', label: "Avis sanitaires de l'ARS", kind: 'avis', theme: null, descCommune: "avis sanitaire de l'ARS le plus grave de l'année" },
]

type Indic = Pick<IndicateurCommune, 'kind' | 'fam'>

/**
 * Valeur d'une commune (MapRow) : classe de la famille, restriction (0 ou 1) ou niveau d'avis de l'ARS ; null sans
 * prélèvement, famille non analysée ou pas d'information (délégation sans information, MapRow[14] null).
 */
export function valeurCommune(ind: Indic, row: MapRow | undefined): number | null {
  if (!row || row[0] === 0) return null
  // niveau de gravité, pas seulement présence ; absent des fichiers antérieurs : aucun avis
  if (ind.kind === 'avis') return row[14] === undefined ? 0 : row[14]
  if (ind.kind === 'situation') return codeFamille(row[15], ind.fam!)
  const c = codeFamille(row[15], 'toutes')
  // Délégation sans information (règle étendue aux restrictions le 27/09) : « ni restriction ni consigne » ne s'y
  // établit pas ; la commune prend les hachures « pas d'information ».
  return c == null ? null : c === 2 ? 1 : row[14] === null ? null : 0
}

/** État d'une commune dans l'info-bulle : classe de la famille, restriction et familles en cause, ou avis. */
export function etatCommune(ind: Indic, row: MapRow, annee: string | number | null | undefined): string {
  if (ind.kind === 'avis') return libelleAvisCarte(row[14])
  const v = valeurCommune(ind, row)
  if (ind.kind === 'situation') return v == null ? 'famille non analysée' : libelleClasse(ind.fam!, v, annee)
  if (v == null) return row[14] === null ? AVIS_SANS_INFORMATION : 'aucune famille analysée'
  return v === 1 ? `restriction ou consigne (${causesRestriction(row[15]).join(', ')})` : 'ni restriction ni consigne'
}

/**
 * Info-bulle d'une commune de la carte. Un arrondissement de Paris, Marseille ou Lyon prend les données de sa commune
 * (communeDeRattachement) : le contrôle sanitaire ne connaît que la commune, et l'info-bulle le dit.
 */
export function infoBulleCommune(
  p: Record<string, unknown>,
  map: MapFile | null | undefined,
  noms: ReadonlyMap<string, string>,
  annee: string | number | null | undefined,
  etat: (row: MapRow) => string,
): string {
  const code = String(p.code)
  const rattache = communeDeRattachement(code)
  const nomPropre = (p.nom as string | undefined) ?? noms.get(code)
  const nomCommune = noms.get(rattache) ?? rattache
  const titre = rattache !== code && nomPropre ? `<b>${nomPropre}</b> · ensemble de ${nomCommune}` : `<b>${nomPropre ?? nomCommune}</b>`
  const row = map?.[rattache]
  if (!row || row[0] === 0) return `${titre}<br>pas de prélèvement en ${annee}`
  return `${titre}<br>${etat(row)} · ${fmt.int(row[0])} prélèvements`
}

/** Échelle de la carte communale : palette de « Lire un bulletin » (situation, restriction, avis). */
export function echelleCommune(ind: Indic): Scale {
  return ind.kind === 'situation' ? situationScale(ind.fam!) : ind.kind === 'restriction' ? restrictionScale : avisScale
}

/** Libellés des niveaux de la légende communale (restriction, avis de l'ARS) ; les familles ont `legendeSituation`. */
export function niveauxCommune(ind: Indic): string[] | undefined {
  if (ind.kind === 'restriction') return ['ni restriction ni consigne', 'restriction ou consigne']
  if (ind.kind === 'avis') return [0, 1, 2, 3].map((c) => AVIS_PAR_CODE[c])
  return undefined
}

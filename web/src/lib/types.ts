/** Formes des fichiers produits par le pipeline (pipeline/robinet/build.py). Les clés d'année sont des chaînes. */

export type Famille =
  | 'pesticides'
  | 'pfas'
  | 'azote'
  | 'microbio'
  | 'metaux_mineraux'
  | 'organiques'
  | 'radioactivite'
  | 'physico_chimie'
  | 'organoleptique'

export interface ParamInfo {
  l: string // libellé
  u: string | null // code unité Sandre
  lim: string | null // limite de qualité, texte SISE-Eaux (« <=50 mg/L »)
  ref: string | null // référence de qualité
  f: Famille
  n: number // analyses, tous millésimes
  nd: number // dépassements de limite
  nr: number // dépassements de référence
  nq: number // résultats quantifiés (> 0)
  a: number[] // millésimes présents
  k: string | null // libellé court si paramètre clé
}

export interface ParamsFile {
  familles: Record<Famille, string>
  cles: Record<string, string>
  params: Record<string, ParamInfo>
}

export interface CommuneIndexEntry {
  c: string // code INSEE
  n: string // nom
  d: string // département
}

export interface PlvStats {
  n: number
  nc_bact: number // prélèvements non conformes (limites) bactériologie
  ne_bact: number // prélèvements évalués en bactériologie
  nc_chim: number
  ne_chim: number
  nr_bact?: number // non conformes aux références
  nr_chim?: number
}

export interface FamStats {
  n: number
  nd: number
  nr?: number
  nq: number
  npd: number // prélèvements avec au moins un dépassement
  res_dep?: number // réseaux avec dépassement
  res_tot?: number
  com_dep?: number // communes avec dépassement
  com_tot?: number
}

export interface TopParam {
  p: string
  n: number
  nd: number
  nq: number
  npd: number
}

export interface NationalYear {
  plv: PlvStats
  fam: Partial<Record<Famille, FamStats>>
  top: TopParam[]
  n_communes: number
  n_reseaux: number
}

export interface DeptYear {
  plv: PlvStats
  fam: Partial<Record<Famille, FamStats>>
}

export interface NationalFile {
  annees: Record<string, NationalYear>
  depts: Record<string, Record<string, DeptYear>> // clé : code département SISE (« 035 »)
}

/** [n_plv, nc_bact, ne_bact, nc_chim, ne_chim, nd_pesticides, nd_azote, nd_pfas, nd_microbio, nd_metaux, nd_total, vmax_nitrates, vmax_pesticides, n_reseaux, avis_ars] */
export type MapRow = [
  number, number, number, number, number, number, number, number, number, number, number,
  number | null, number | null, number,
  /**
   * avis sanitaire de l'ARS le plus grave de l'année, hors avis limités à un bâtiment : 0 aucun, 1 publics sensibles, 2 ébullition,
   * 3 restriction pour tous ; null « pas d'information » (un réseau de la commune relève d'une délégation de l'ARS dont aucune
   * conclusion de l'année n'évoque de consigne, pipeline/robinet/avis.py) ; absent des fichiers antérieurs
   */
  (number | null)?,
  /** situations des réseaux qui desservent la commune, un chiffre par famille (lib/situations.ts), la plus défavorable */
  string?,
]
export type MapFile = Record<string, MapRow>

/** [n, nd, nr, nq, vmax, vmean, vlast, dlast] */
export type ParamRec = [number, number, number, number, number | null, number | null, number | null, string | null]

export interface CommuneYearStats {
  plv: [number, number, number, number, number, number, number] // n, nc_bact, ne_bact, nc_chim, ne_chim, nr_bact, nr_chim
  fam: Partial<Record<Famille, [number, number, number, number]>> // n, nd, nr, nq
  cle: Record<string, ParamRec>
  dep: [string, ...ParamRec][] // paramètres en dépassement, triés par nombre de dépassements
  /** substances sans limite ni référence (horsgrille.json) : [code, analyses, quantifiées, max] et, par groupe, [recherchées, quantifiées] */
  hg?: { s: [string, number, number, number | null][]; g: Partial<Record<HgGroupe, [number, number]>> }
}

export interface CommuneDetail {
  nom: string
  reseaux: Record<string, string[]>
  stats: Record<string, CommuneYearStats>
}

export interface ReseauInfo {
  nom: string | null
  dist: string | null
  uge: string | null
  communes: string[]
  stats?: Record<string, CommuneYearStats>
}

/** sispea/services-index.json : id → [collectivité, département, population, mode de gestion, nom de l'entité de gestion] */
export type SispeaServicesIndex = Record<string, [string | null, string | null, number | null, string | null, string | null]>

/** Code département usuel (« 35 », « 2A », « 971 ») → code SISE (« 035 », « 02A », « 971 »). */
export function siseOfDept(dd: string): string {
  return dd.length === 2 ? '0' + dd : dd
}

export interface DeptFile {
  dept: string
  annees: number[]
  reseaux: Record<string, ReseauInfo>
  communes: Record<string, CommuneDetail>
}

export interface ThemeFile {
  slug: string
  titre: string
  question: string
  famille: Famille
  param_cle: string
  national: Record<string, FamStats>
  params: { p: string; l: string | null; n: number; nd: number; nq: number; npd: number }[]
  depts: Record<string, Record<string, { n: number; nd: number; nq: number; res_dep: number; res_tot: number }>>
  top_reseaux: {
    r: string
    d: string
    dist: string | null
    nd: number
    n: number
    vmax: number | null
    nom: string | null
    nc: number
  }[]
  cle: Record<string, { n_res: number; p50: number | null; p90: number | null; max: number | null; res_dep: number }>
}

export interface MetaFile {
  annees: number[]
  partiel: number[] // millésimes encore en cours de publication
  construit_le: string
  themes: { slug: string; titre: string; question: string }[]
}

/** Dernier millésime complet (les millésimes partiels ne sont proposés que sur demande). */
export function defaultYear(meta: MetaFile | null): number | undefined {
  if (!meta) return undefined
  const complete = meta.annees.filter((a) => !(meta.partiel ?? []).includes(a))
  return (complete.length ? complete : meta.annees).at(-1)
}

export function yearLabel(meta: MetaFile | null, a: number | string): string {
  return `${a}${(meta?.partiel ?? []).includes(Number(a)) ? ' (en cours)' : ''}`
}

// --- Séries mensuelles d'un paramètre --------------------------------------------------------
export interface SeriesFile {
  code: string
  l: string
  u: string | null
  lim: string | null
  ref: string | null
  mois: string[] // « 2023-01 » …
  national: { n: (number | null)[]; nd: (number | null)[]; nq: (number | null)[]; npd: (number | null)[]; moy: (number | null)[]; p50: (number | null)[]; p90: (number | null)[]; max: (number | null)[] }
  depts: Record<string, { n: number[]; nd: number[]; nq: number[]; max: (number | null)[] }> // clé SISE (« 035 »)
}

/** series/index.json : paramètres qui disposent d'une série mensuelle (sélecteurs de la carte et des thèmes). */
export interface SeriesIndexEntry {
  code: string
  l: string
  u: string | null
  f: Famille
  lim: string | null
  ref?: string | null
  k: string | null
  nd: number
}

/** series/dept/<dd>.json : séries mensuelles par réseau pour quelques paramètres phares. */
export interface SeriesDeptFile {
  mois: string[]
  params: string[]
  reseaux: Record<string, Record<string, { n: number[]; nd: number[]; nq: number[]; max: (number | null)[] }>>
}

// --- SISPEA (services d'eau potable) ---------------------------------------------------------
export interface SispeaStat {
  p50: number | null
  p10: number | null
  p90: number | null
  pond: number | null // moyenne pondérée par la population desservie
  n: number
}
export interface SispeaYear {
  n: number
  pop: number | null
  prix: SispeaStat // D102.0, € TTC / m³ pour 120 m³
  rend: SispeaStat // P104.3, rendement du réseau (%)
  ilp: SispeaStat // P106.3, pertes m³/km/jour
  renouv: SispeaStat // P107.2, renouvellement annuel (%)
  cbact: SispeaStat
  cchim: SispeaStat
  patrim: SispeaStat
  impayes: SispeaStat
}
export interface SispeaDeptYear extends SispeaYear {
  part_pop_delegation: number | null
}
export interface SispeaNationalFile {
  annees: Record<string, SispeaYear>
  gestion: Record<string, Partial<Record<'regie' | 'delegation', SispeaYear>>>
  depts: Record<string, Record<string, SispeaDeptYear>>
  serie_api: Record<string, Record<string, { p50: number | null; p10: number | null; p90: number | null; n: number }>>
  indicateurs: Record<string, string>
}
export interface SispeaCommuneYear {
  id: string | null
  nom: string | null
  coll: string | null
  mode: string | null
  op: string | null
  pop: number | null
  pop_com: number | null
  secteur: string | null
  statut: string | null
  ind: Record<string, number>
}
export type SispeaDeptFile = Record<string, Record<string, SispeaCommuneYear>>
export interface SispeaService {
  nom?: string | null
  coll?: string | null
  dept?: string | null
  mode?: string | null
  op?: string | null
  statut?: string | null
  pop?: number | null
  annee_ind?: number | null
  ind?: Record<string, number>
  annee_communes?: number
  communes?: string[]
}
export type SispeaServicesFile = Record<string, SispeaService>

// --- Amont du robinet : BNPE, BNV-D, ADES ------------------------------------------------------
export interface AmontBnpeYear {
  volume: number | null
  sout: number | null
  cont: number | null
  n_ouvrages: number
  n_depts: number
}
export interface AmontBnpeDept {
  volume: number | null
  part_sout: number | null
  n_ouvrages: number
  top: { nom: string | null; commune: string | null; volume: number; milieu: string }[]
}
export interface AmontBnvdDept {
  kg: number | null
  herbicides: number | null
  fongicides: number | null
  top: { s: string; kg: number }[]
}
export interface AmontAdesDept {
  n: number
  sup_seuil: number
  sup_demi: number
  n_aep: number
  aep_sup_seuil: number
  mediane: number | null
}
export interface AmontAdes {
  seuil: number
  n_points: number
  sup_seuil: number
  sup_demi: number
  n_points_aep: number
  aep_sup_seuil: number
  mediane: number | null
  depts: Record<string, AmontAdesDept>
}
export interface AmontCroisementDept {
  robinet_part_reseaux: number | null
  robinet_res_dep: number
  robinet_res_tot: number
  ventes_kg: number | null
  nappes_nitrates_sup50: number | null
  nappes_nitrates_n: number | null
  nappes_pesticides_sup: number | null
  nappes_pesticides_n: number | null
  rivieres_nitrates_sup?: number | null
  rivieres_nitrates_n?: number | null
  rivieres_pesticides_sup?: number | null
  rivieres_pesticides_n?: number | null
  aep_part_sout: number | null
  aep_volume: number | null
}
export interface AmontRivieres {
  seuil: number
  n_stations: number
  sup_seuil: number
  sup_demi: number
  mediane: number | null
  depts: Record<string, { n: number; sup_seuil: number; sup_demi: number; mediane: number | null }>
}
export interface AmontFile {
  rivieres?: Partial<Record<'nitrates' | 'pesticides', AmontRivieres>>
  bnpe: { annees?: Record<string, AmontBnpeYear>; annee_ref?: number; depts?: Record<string, AmontBnpeDept> }
  bnvd: {
    annees?: Record<string, { kg: number | null; herbicides: number | null; fongicides: number | null; insecticides: number | null; n_depts: number }>
    annee_ref?: number
    top_substances?: { s: string; f: string | null; kg: number | null; cas: string | null }[]
    depts?: Record<string, AmontBnvdDept>
  }
  ades: Partial<Record<'nitrates' | 'pesticides', AmontAdes>>
  croisement: { annee_robinet?: number; depts?: Record<string, AmontCroisementDept> }
}
export interface AmontNappeStat {
  annee: number
  n: number
  max: number | null
  moy: number | null
  dernier: number | null
}
export interface AmontDeptFile {
  ouvrages: Record<string, { nom: string | null; commune: string | null; milieu: string; lon: number | null; lat: number | null; volumes: Record<string, number | null> }>
  nappes: Record<string, { commune: string | null; lon: number | null; lat: number | null; aep: boolean; nitrates?: AmontNappeStat; pesticides?: AmontNappeStat }>
}

/** Code département SISE (« 035 », « 02A », « 971 ») → code usuel (« 35 », « 2A », « 971 »). */
export function deptCode(sise: string): string {
  return sise.length === 3 && sise.startsWith('0') ? sise.slice(1) : sise
}

export function deptOfInsee(insee: string): string {
  // Saint-Martin (978) et Saint-Barthélemy (977) sont repliés sur la Guadeloupe (971), comme côté pipeline
  // (build._dept_of_insee) : ils n'ont ni fiche ni contour propres, faute de seuils SISPEA et de département
  // distinct dans C.DEPARTEMENTS. Sans ce repli ici, leurs communes redemandaient /dept/977.json ou 978.json,
  // des fichiers que le pipeline ne produit pas, et leur fiche affichait « Département introuvable ».
  if (insee.startsWith('977') || insee.startsWith('978')) return '971'
  return insee.startsWith('97') || insee.startsWith('98') ? insee.slice(0, 3) : insee.slice(0, 2)
}

// --- Avis sanitaires de l'ARS (conclusions des prélèvements) ----------------------------------
export type AvisCat = 'interdiction' | 'ebullition' | 'sensibles'
export const AVIS_CODE: Record<AvisCat, number> = { sensibles: 1, ebullition: 2, interdiction: 3 }
export const AVIS_LIBELLE: Record<AvisCat, string> = {
  interdiction: 'restriction de consommation',
  ebullition: "consigne d'ébullition",
  sensibles: 'déconseillée aux publics sensibles',
}
/** Libellé d'un code de carte (MapRow[14]). */
export const AVIS_PAR_CODE: Record<number, string> = { 0: 'aucun avis', 1: AVIS_LIBELLE.sensibles, 2: AVIS_LIBELLE.ebullition, 3: AVIS_LIBELLE.interdiction }
/** État d'une commune ou d'un département dont les conclusions de l'ARS n'évoquent aucune consigne de l'année (MapRow[14] null). */
export const AVIS_SANS_INFORMATION = "pas d'information"
/** Libellé du code d'avis d'une commune (MapRow[14]) : null « pas d'information » ; absent (fichier antérieur) « aucun avis ». */
export function libelleAvisCarte(code: number | null | undefined): string {
  return code === null ? AVIS_SANS_INFORMATION : AVIS_PAR_CODE[code ?? 0]
}
/**
 * Lecture des conclusions par délégation de l'ARS (code du département qu'elle suit, « 38 ») et par année : [prélèvements
 * conclus, dont la conclusion évoque une consigne — prescrite, écartée ou rappelée]. Et, par année, les délégations « sans
 * information », selon la règle du pipeline (avis.sans_information : aucune conclusion de l'année n'en parle).
 */
export interface LectureAvis {
  lecture?: Record<string, Record<string, [number, number]>>
  sans_information?: Record<string, string[]>
}
export interface AvisDeptFile extends LectureAvis {
  /** formulations : texte ARS, catégorie, avis limité à un bâtiment/point d'usage/point de prélèvement, causes lues dans le texte */
  textes: Record<string, { t: string; c: AvisCat; l: boolean; k: string[] }>
  /** par commune : [date du prélèvement, id de formulation, réseau], du plus récent au plus ancien */
  communes: Record<string, [string, number, string][]>
}
type AvisCompte = { plv: number; reseaux: number; communes: number }
export interface AvisNationalFile extends LectureAvis {
  libelles: Record<AvisCat, string>
  annees: Record<string, Partial<Record<AvisCat | 'local', AvisCompte>> & { communes_toutes?: number }>
  causes: Record<string, Partial<Record<AvisCat, Record<string, number>>>>
  depts: Record<string, Record<string, Partial<Record<AvisCat | 'toutes', number>>>>
}

// --- Substances sans limite ni référence (horsgrille.json) -------------------------------------
export type HgGroupe = 'perchlorate' | 'tfa' | 'metabolites' | 'pfas' | 'haloacetiques' | 'autres'
export interface HgRepere {
  v: number
  lib: string
  src: string
}
export interface HgAnnee {
  n: number
  nq: number
  res: number
  res_q: number
  vmax: number | null
  com?: number
  com_q?: number
  /** par repère (valeur en clé) : réseaux et communes dont le maximum de l'année le dépasse */
  au_dela?: Record<string, { res: number; com: number }>
}
export interface HorsGrilleFile {
  groupes: Record<HgGroupe, string>
  annees: string[]
  substances: Record<string, { l: string; u: string | null; g: HgGroupe; reperes: HgRepere[]; annees: Record<string, HgAnnee> }>
  par_groupe: Partial<Record<HgGroupe, Record<string, { com: number; com_q: number; subst_q: number; com_tot: number }>>>
  /** groupe → année → département → [communes avec prélèvements, communes où recherché, communes où quantifié] */
  depts: Partial<Record<HgGroupe, Record<string, Record<string, [number, number, number]>>>>
}

// --- Nappes (piézométrie) et historique des restrictions sécheresse ------------------------------
export interface NappesNational {
  classes: string[]
  mois_ref: string
  mois: string[]
  /** mois → nombre de piézomètres dans chaque classe (très bas … très haut) */
  historique: Record<string, number[]>
  depts: Record<string, Record<string, number[]>>
  n_piezometres: number
  methode: string
}
export interface Piezometre {
  insee: string | null
  commune: string | null
  nappe: string | null
  prof: number | null
  xy: [number | null, number | null]
  debut: string | null
  serie: [string, number | null][]
  /** mois calendaire (« 08 ») → [p10, p50, p90] du niveau moyen mensuel des années passées */
  normale: Record<string, [number | null, number | null, number | null]>
  classes: Record<string, number>
}
export interface NappesDept {
  mois_ref: string
  piezometres: Record<string, Piezometre>
  /** commune → [piézomètre le plus proche, distance en km] */
  communes: Record<string, [string, number]>
}
export interface SecheresseHist {
  niveaux: string[]
  annees: string[]
  maj: string
  /** département → année → jours au niveau le plus grave du jour : [vigilance, alerte, alerte renforcée, crise] */
  depts: Record<string, Record<string, [number, number, number, number]>>
  depts_aep: Record<string, Record<string, [number, number, number, number]>>
  national: Record<string, { jours: [number, number, number, number]; depts_crise: number; depts_touches: number }>
  /** année → jour → nombre de départements à chaque niveau */
  quotidien: Record<string, [number, number, number, number][]>
}

// --- Pression sur la ressource (ressource/national.json) ------------------------------------------
export interface RessourceDept {
  prel_m3?: number | null
  prel_evol?: number | null
  part_nappe?: number | null
  part_zre?: number | null
  serie_prel?: Record<string, number | null>
  conso_l_hab_j?: number | null
  pertes_pct?: number | null
  pertes_m3?: number | null
  protection?: number | null
  protection_moy?: number | null
  nappes_basses?: number | null
  nappes_sous_normale_12m?: number | null
  n_piezo?: number
  jours_crise_ar?: number
  jours_crise_ar_5ans?: number | null
}
export interface RessourceFile {
  depts: Record<string, RessourceDept>
  national: RessourceDept & {
    annee_bnpe: number
    annee_bnpe_ref: number
    annee_sispea: number
    mois_nappes: string
    annee_secheresse: number
    annees_secheresse_5: string[]
    zre_exclues: string[]
    n_zre: number
  }
}

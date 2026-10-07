import { INDICS_AMONT, type IndicAmont } from './amont'
import { fmt } from './data'
import { moisFr } from './nappes'
import type { SectionDept } from './parcours'
import { fmtRessource, INDICS_RESSOURCE, valeurRessource, type IndicRessource } from './ressource'
import { divergingScale, stepScale, type Scale } from './scale'
import type { ColService } from './servicesCommunes'
import { INDICS_SISPEA } from './sispea'
import type { AmontFile, RessourceFile, SispeaNationalFile } from './types'

/**
 * Indicateurs par département des pages « Comprendre », proposés sur /carte à côté de ceux de l'eau du robinet
 * (demande de l'auteur, 24/09 : « tous, rangés par thème »). Ceux des services d'eau (SISPEA) ont aussi une vue
 * communale (`commune`) : chaque commune y prend la valeur du service qui la dessert. Les autres sources ne descendent
 * pas à la commune (prélèvements, nappes, sécheresse, amont : par ouvrage, station ou zone). Chacun garde son calendrier — années SISPEA au choix, période la plus récente publiée pour la
 * ressource et l'amont — et ses paliers, repris des définitions de ses pages (lib/sispea.ts, lib/ressource.ts,
 * lib/amont.ts) : une carte ne peut pas contredire l'autre.
 *
 * Écartés parce que déjà proposés : « réseaux non conformes aux pesticides au robinet » (amont, c'est l'indicateur
 * Pesticides) et « part de l'eau potable prélevée en nappe » (amont, doublon de celle de la ressource).
 */

export const GROUPES_DEPT = ["Service d'eau", 'Ressource et amont'] as const
export type GroupeDept = (typeof GROUPES_DEPT)[number]

export interface DonneesDept {
  sispea?: SispeaNationalFile | null
  ressource?: RessourceFile | null
  amont?: AmontFile | null
}

export interface IndicDept {
  /** Clé dans l'URL (?indic=) ; aucune ne recoupe celles de l'eau du robinet (test). */
  key: string
  groupe: GroupeDept
  source: 'sispea' | 'ressource' | 'amont'
  /** Libellé court du menu ; le libellé complet va dans la légende et le titre. */
  menu: string
  label: string
  unit: string
  /** Sens où la valeur signale un coût ou une pression plus forts ; null : descriptif, ni bon ni mauvais. */
  pire: 'haut' | 'bas' | null
  note?: string
  /** Page qui développe l'indicateur. */
  page: { to: string; label: string }
  /** Section de la fiche département qui le reprend : une ancre la déplie à l'arrivée (lib/parcours.ts). */
  section: SectionDept
  /** Ligne « Source » sous la carte. */
  sourceTexte: string
  /** Valeurs par département ; `annee` : millésime SISPEA choisi (les autres sources n'en publient qu'un). */
  valeurs: (d: DonneesDept, annee?: string) => Map<string, number>
  /** Période des données, en toutes lettres (« 2023 », « août 2026 », « depuis 2020 »). */
  periode: (d: DonneesDept, annee?: string) => string
  /** Valeur écrite avec son unité (info-bulle, classement). */
  ecrire: (v: number) => string
  /** Borne de palier écrite dans la légende. */
  borne: (v: number) => string
  echelle: () => Scale
  /**
   * Vue communale (auteur, 24/09 : il manquait « Toutes les communes » à ces thèmes) : chaque commune prend la valeur
   * du service d'eau qui la dessert (lib/servicesCommunes.ts), sur les paliers de la carte départementale. Absente,
   * la carte reste départementale.
   */
  commune?: {
    col: ColService
    /** Ce que montre la couleur d'une commune, pour la légende. */
    desc: string
    /** Valeur à deux états (mode de gestion) : un libellé par état, à la place des paliers. */
    binaire?: string[]
    /** Origine d'une valeur recalculée par le site, sous la légende (à défaut : « valeur déclarée par le service »). */
    note?: string
  }
}

/** Mois ISO d'une période (« 2026-08 », « 12 mois à 2026-08 ») écrits en toutes lettres ; « 2018-2023 » reste tel quel. */
export function periodeLisible(p: string): string {
  return p.replace(/\b(\d{4})-(0[1-9]|1[0-2])\b/g, (m) => moisFr(m))
}

function carte<T>(entrees: Record<string, T> | undefined, lire: (x: T) => number | null): Map<string, number> {
  const m = new Map<string, number>()
  for (const [dd, x] of Object.entries(entrees ?? {})) {
    const v = lire(x)
    if (v != null) m.set(dd, v)
  }
  return m
}

const SOURCE_SISPEA = "Source : observatoire des services publics d'eau et d'assainissement (SISPEA, Office français de la biodiversité), indicateurs déclarés par les collectivités."

const MENU_SISPEA: Record<string, string> = {
  prix: 'Prix moyen du m³',
  rend: 'Rendement du réseau',
  renouv: 'Renouvellement des canalisations',
  delegation: 'Population en gestion déléguée',
}

const COMMUNE_SISPEA: Record<string, IndicDept['commune']> = {
  prix: { col: 'prix', desc: 'prix du m³ du service qui dessert la commune, TTC pour 120 m³ par an' },
  rend: { col: 'rend', desc: 'rendement du réseau du service qui dessert la commune' },
  renouv: { col: 'renouv', desc: 'renouvellement des canalisations du service qui dessert la commune, moyenne des cinq dernières années' },
  delegation: { col: 'mode', desc: 'mode de gestion du service qui dessert la commune', binaire: ['régie', 'gestion déléguée'] },
}

const SISPEA: IndicDept[] = INDICS_SISPEA.map((i) => ({
  key: i.key,
  groupe: "Service d'eau",
  source: 'sispea',
  menu: MENU_SISPEA[i.key],
  label: i.label,
  unit: i.unit,
  pire: i.higherIsWorse === true ? 'haut' : i.higherIsWorse === false ? 'bas' : null,
  page: { to: `/services?indic=${i.key}`, label: "Voir les services d'eau" },
  section: 'services',
  sourceTexte: SOURCE_SISPEA,
  valeurs: (d, annee) => carte(d.sispea?.depts, (parAn) => (annee && parAn[annee] ? i.get(parAn[annee]) : null)),
  periode: (_, annee) => annee ?? '',
  ecrire: (v) => `${fmt.dec(v, i.dec)} ${i.unit}`,
  borne: (v) => fmt.dec(v, i.key === 'prix' || i.key === 'renouv' ? i.dec : 0),
  echelle: () => stepScale(i.paliers, { invert: i.higherIsWorse === false, ouvertBas: i.ouvertBas }),
  commune: COMMUNE_SISPEA[i.key],
}))

const MENU_RESSOURCE: Record<IndicRessource, string> = {
  part_zre: 'Prélèvements en zone de déficit',
  prel_evol: 'Évolution des prélèvements sur 5 ans',
  pertes_pct: 'Eau perdue en fuites',
  conso_l_hab_j: 'Consommation par habitant',
  protection_moy: 'Protection des captages',
  nappes_basses: 'Nappes basses, dernier mois',
  nappes_sous_normale_12m: 'Nappes sous la normale, 12 mois',
  jours_crise_ar: "Jours d'alerte renforcée ou de crise",
  jours_crise_ar_5ans: "Jours d'alerte renforcée ou de crise, 5 ans",
  part_nappe: 'Prélèvements faits en nappe',
}

const SOURCE_RESSOURCE: Record<IndicRessource, string> = {
  part_zre: "Source : BNPE, volumes prélevés pour l'eau potable (Office français de la biodiversité) ; zones de répartition des eaux (Sandre).",
  prel_evol: "Source : BNPE, volumes prélevés pour l'eau potable (Office français de la biodiversité), moyennes de trois ans.",
  part_nappe: "Source : BNPE, volumes prélevés pour l'eau potable (Office français de la biodiversité).",
  pertes_pct: SOURCE_SISPEA,
  conso_l_hab_j: SOURCE_SISPEA,
  protection_moy: SOURCE_SISPEA,
  nappes_basses: "Source : piézométrie Hub'Eau (BRGM) ; niveau du mois comparé aux mêmes mois des années passées, calcul du site.",
  nappes_sous_normale_12m: "Source : piézométrie Hub'Eau (BRGM) ; niveau du mois comparé aux mêmes mois des années passées, calcul du site.",
  jours_crise_ar: 'Source : arrêtés préfectoraux de restriction sécheresse (jeu « Donnée Sécheresse », VigiEau).',
  jours_crise_ar_5ans: 'Source : arrêtés préfectoraux de restriction sécheresse (jeu « Donnée Sécheresse », VigiEau).',
}

/** Consommation et fuites service par service (pipeline/robinet/build_sispea.py) : écarts extrêmes assumés (auteur, 24/09). */
const VOLUMES_DECLARES =
  'Calcul du site à partir des volumes que chaque service déclare à l’observatoire SISPEA. Un petit service ou une commune touristique peut présenter une valeur extrême.'

/** Indicateurs de la ressource tirés de la SISPEA : leur vue communale lit l'année SISPEA de la page Ressource. */
const COMMUNE_RESSOURCE: Partial<Record<IndicRessource, IndicDept['commune']>> = {
  protection_moy: { col: 'protection', desc: 'avancement de la protection des captages du service qui dessert la commune' },
  conso_l_hab_j: { col: 'conso', desc: 'consommation domestique par habitant du service qui dessert la commune', note: VOLUMES_DECLARES },
  pertes_pct: { col: 'pertes', desc: "part de l'eau mise en distribution perdue par le service qui dessert la commune", note: VOLUMES_DECLARES },
}

const RESSOURCE: IndicDept[] = INDICS_RESSOURCE.map((i) => ({
  key: i.key,
  groupe: 'Ressource et amont',
  source: 'ressource',
  menu: MENU_RESSOURCE[i.key],
  label: i.label,
  unit: i.unit,
  pire: i.pire,
  page: { to: `/ressource?indic=${i.key}`, label: 'Voir la ressource' },
  section: 'pressions',
  sourceTexte: SOURCE_RESSOURCE[i.key],
  valeurs: (d) => carte(d.ressource?.depts, (x) => valeurRessource(x, i.key)),
  periode: (d) => (d.ressource ? periodeLisible(i.annee(d.ressource.national)) : ''),
  ecrire: (v) => fmtRessource(i, v),
  borne: (v) => fmtRessource(i, v, false),
  echelle: () => (i.divergent ? divergingScale(i.paliers) : stepScale(i.paliers, { invert: i.pire === 'bas', ouvertBas: i.ouvertBas, rampe: i.rampe })),
  commune: COMMUNE_RESSOURCE[i.key],
}))

/** Clés de /carte des indicateurs de l'amont : « nitrates » y désignerait l'eau du robinet (clé « azote »). */
const CLE_AMONT: Partial<Record<IndicAmont, string>> = { nitrates: 'nappes_nitrates' }
const MENU_AMONT: Partial<Record<IndicAmont, string>> = {
  ventes: 'Ventes de pesticides',
  nitrates: 'Nitrates dans les nappes',
  pesticides_nappes: 'Pesticides dans les nappes',
  rivieres_nitrates: 'Nitrates dans les rivières',
  rivieres_pesticides: 'Pesticides dans les rivières',
}
const SOURCE_AMONT: Partial<Record<IndicAmont, string>> = {
  ventes: "Source : BNV-D, ventes de substances par département du siège du distributeur (Office français de la biodiversité, Hub'Eau). Les ventes sont localisées au point de vente et non au lieu d'épandage.",
  nitrates: "Source : ADES, qualité des eaux souterraines (BRGM, Hub'Eau), analyses depuis 2020.",
  pesticides_nappes: "Source : ADES, qualité des eaux souterraines (BRGM, Hub'Eau), analyses depuis 2020.",
  rivieres_nitrates: "Source : Naïades, qualité des cours d'eau (Office français de la biodiversité, Hub'Eau), analyses depuis 2020.",
  rivieres_pesticides: "Source : Naïades, qualité des cours d'eau (Office français de la biodiversité, Hub'Eau), analyses depuis 2020.",
}

const AMONT: IndicDept[] = INDICS_AMONT.filter((i) => i.key !== 'robinet' && i.key !== 'sout').map((i) => ({
  key: CLE_AMONT[i.key] ?? i.key,
  groupe: 'Ressource et amont',
  source: 'amont',
  menu: MENU_AMONT[i.key] ?? i.label,
  label: i.label,
  unit: i.unit,
  pire: i.higherIsWorse === true ? 'haut' : i.higherIsWorse === false ? 'bas' : null,
  note: i.note,
  page: { to: `/amont?indic=${i.key}`, label: "Voir l'amont du robinet" },
  section: 'services',
  sourceTexte: SOURCE_AMONT[i.key] ?? '',
  valeurs: (d) => carte(d.amont?.croisement.depts, (x) => i.get(x)),
  periode: (d) => (i.key === 'ventes' ? String(d.amont?.bnvd.annee_ref ?? '') : 'depuis 2020'),
  ecrire: (v) => `${i.unit === 't' ? fmt.int(v) : fmt.dec(v, 1)} ${i.unit}`,
  borne: (v) => (i.unit === 't' ? fmt.int(v) : fmt.dec(v, 0)),
  echelle: () => stepScale(i.paliers, { invert: i.higherIsWorse === false }),
}))

export const INDICS_DEPT: IndicDept[] = [...SISPEA, ...RESSOURCE, ...AMONT]

/**
 * Liens vers la fiche d'un département qui gardent le sujet de la page d'où l'on vient (choix de l'auteur, 25/09,
 * après le relevé « Parcours du robinet » : 217 liens et 9 cartes ouvraient la fiche sur « Toutes familles », le prix
 * de l'eau ou la sécheresse restant repliés en bas de page).
 *
 * Deux canaux, selon ce que la fiche sait montrer : une famille ou les avis passent par `indic`, la clé que la fiche
 * lit à l'arrivée et que son lien de retour vers la carte conserve (Departement.tsx) ; les services d'eau, les
 * pressions, la ressource et les substances sans limite de qualité, par l'ancre de leur section, que Section déplie à
 * l'arrivée. Pour ces dernières, le groupe regardé sur /hors-grille suit (`?groupe=`, choix de l'auteur, 26/09).
 */
export type SectionDept = 'services' | 'pressions' | 'ressource' | 'hors-grille'
export type SujetDept = { indic: string } | { section: SectionDept; groupe?: string } | null

export function lienDepartement(dd: string, sujet: SujetDept = null): string {
  if (!sujet) return `/departement/${dd}`
  if ('indic' in sujet) return `/departement/${dd}?indic=${encodeURIComponent(sujet.indic)}`
  const q = sujet.groupe ? `?groupe=${encodeURIComponent(sujet.groupe)}` : ''
  return `/departement/${dd}${q}#${sujet.section}`
}

/**
 * Famille d'un thème (slug de meta.themes), dans les clés communes à la carte et à la fiche département. La
 * radioactivité n'a pas de vue sur la fiche : pas de sujet transmis.
 */
const INDIC_THEME: Record<string, string> = { pesticides: 'pesticides', nitrates: 'azote', pfas: 'pfas', bacteries: 'microbio', metaux: 'metaux' }

export function sujetTheme(slug: string | undefined): SujetDept {
  const indic = slug ? INDIC_THEME[slug] : undefined
  return indic ? { indic } : null
}

/** Les communes d'un département sur la carte, pour un indicateur que la carte sait détailler par commune. */
export function lienCommunesCarte(dd: string, indic: string, autres: Record<string, string> = {}): string {
  const q = new URLSearchParams({ indic, ...autres, dept: dd })
  return `/carte?${q.toString()}`
}

/** Liens de l'encart d'une carte (components/EncartCarte) : la fiche du département, et ses communes (adresse, ou action sur la même carte). */
export interface LiensEncart {
  fiche?: string
  communes?: string | (() => void)
  /** Communes du département sur la qualité de l'eau, quand la carte n'a pas de vue communale (liensAvecCommunes). */
  communesQualite?: string
}

/** Indicateur de la carte des communes quand la page n'en a pas : la qualité de l'eau, toutes familles (Carte.tsx, `any`). */
const INDIC_QUALITE = 'any'

/**
 * Liens de l'encart d'une carte des départements, qui descend toujours d'un niveau (choix de l'auteur, 27/09 : « parfois
 * ça ne descend pas de niveau »). Une carte sans vue communale (radioactivité, amont, nappes, ressource, substances sans
 * limite de qualité, sécheresse, paramètre de laboratoire), dont les sources sont départementales ou par station,
 * ouvrage ou zone, propose les communes du département sur la qualité de l'eau ; l'encart l'écrit, le sujet changeant.
 */
export function liensAvecCommunes(liens: LiensEncart, dd: string): LiensEncart {
  return liens.communes ? liens : { ...liens, communesQualite: lienCommunesCarte(dd, INDIC_QUALITE) }
}

/** Les communes d'un département sur la carte, dans la famille d'un thème ; aucune sans famille (radioactivité). */
export function communesTheme(dd: string, slug: string | undefined): string | undefined {
  const indic = slug ? INDIC_THEME[slug] : undefined
  return indic ? lienCommunesCarte(dd, indic) : undefined
}

/**
 * Section du menu allumée pour une adresse (menu de la refonte, lot 2, choix de l'auteur du 2026-10-05) : Mon eau (les
 * fiches commune, analyses, réseau et service d'eau, que la recherche trouve), La France (la page /france du lot 3, la
 * carte détaillée et la fiche département), Sujets (thèmes, avis de l'ARS, hors grille), La ressource (sommaire, sécheresse, nappes,
 * pression sur la ressource, amont, services d'eau), Méthode (et mentions légales). L'eyebrow de chaque page porte le
 * même nom (`MENU`).
 */
export function sectionDe(pathname: string): string | null {
  if (['/ma-commune', '/commune/', '/reseau/', '/service/'].some((p) => pathname.startsWith(p))) return '/ma-commune'
  if (['/france', '/carte', '/departement/'].some((p) => pathname.startsWith(p))) return '/france'
  if (['/themes', '/avis', '/hors-grille'].some((p) => pathname.startsWith(p))) return '/themes'
  if (['/ressource', '/secheresse', '/nappes', '/amont', '/services'].some((p) => pathname.startsWith(p))) return '/ressource-en-eau'
  if (pathname.startsWith('/methode') || pathname.startsWith('/mentions-legales')) return '/methode'
  return null
}

/** Entrées du menu, dans l'ordre de la maquette du 2026-10-05 ; « À propos », lien externe, les suit (App.tsx). */
export const MENU = [
  ['/ma-commune', 'Mon eau'],
  ['/france', 'La France'],
  ['/themes', 'Sujets'],
  ['/ressource-en-eau', 'La ressource'],
  ['/methode', 'Méthode'],
] as const

/** Nom de la section d'une adresse, pour l'eyebrow et le fil d'Ariane des pages. */
export const nomSection = (to: (typeof MENU)[number][0]) => MENU.find(([t]) => t === to)![1]

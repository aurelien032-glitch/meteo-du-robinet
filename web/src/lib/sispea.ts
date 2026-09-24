import type { SispeaDeptFile, SispeaNationalFile } from './types'

/**
 * Texte SISPEA réellement renseigné, sinon null. Faute de valeur, la SISPEA remplit certains champs d'un
 * simple point : le nom de l'exploitant de la plupart des services (7 942 dans les fichiers du 18/09), le mode
 * de gestion de quelques-uns ; affiché tel quel, cela donnait « exploitant . ». Une valeur vide ou faite
 * seulement d'espaces et de ponctuation vaut absence.
 */
export function renseigne(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t && /[\p{L}\p{N}]/u.test(t) ? t : null
}

/**
 * Mode de gestion lisible, comme le pipeline (GESTION_SQL, pipeline/robinet/build_sispea.py) : régie ou délégation
 * d'après le début du libellé, accents et casse ignorés (« Régie avec prestation de service », « Delegation ») ;
 * null sinon, point de la SISPEA compris. Un fait, écrit sans jugement.
 */
export function modeGestion(mode: string | null | undefined): 'régie' | 'délégation' | null {
  const m = (mode ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
  if (m.startsWith('regie')) return 'régie'
  if (m.startsWith('delegation')) return 'délégation'
  return null
}

/** Service d'eau d'une commune, tel que sa dernière déclaration à la SISPEA le décrit. */
export interface ServiceCommune {
  /** identifiant SISPEA (fiche /service/:id) */
  id: string | null
  /** collectivité, à défaut nom de l'entité de gestion */
  nom: string
  /** entité de gestion, sans le préfixe « eau potable : » : ce qui distingue les services d'une même collectivité
   * (« 01-Rennes-St Jacques », « 02-Secteur Sud » pour la CEBR) ; null si elle ne dit rien de plus */
  entite: string | null
  mode: 'régie' | 'délégation' | null
  exploitant: string | null
  /** prix TTC du m³ pour 120 m³ par an (D102.0) */
  prix: number | null
  /** année SISPEA de ces chiffres : le service et son prix viennent de la même déclaration */
  annee: string
}

/**
 * Service d'une commune pour l'encart « Qui la distribue ? » (maquette du 23/09) : la dernière année où il publie
 * un prix, à défaut sa dernière déclaration. Il ne suit pas l'année du contrôle sanitaire, qui ne gouverne pas
 * les chiffres SISPEA : l'encart les date. null si la commune est absente de l'observatoire.
 */
export function serviceDeCommune(f: SispeaDeptFile | null | undefined, insee: string): ServiceCommune | null {
  const parAnnee = f?.[insee]
  if (!parAnnee) return null
  const annees = Object.keys(parAnnee).sort()
  const avecPrix = annees.filter((a) => parAnnee[a].ind['D102.0'] != null)
  const annee = avecPrix[avecPrix.length - 1] ?? annees[annees.length - 1]
  if (!annee) return null
  const s = parAnnee[annee]
  // Même nettoyage que l'index de recherche (pipeline/robinet/recherche.py, _entite) : « eau potable » seul ne dit rien.
  const entite = renseigne((s.nom ?? '').replace(/^\s*eau potable\s*:?\s*/i, ''))
  return {
    id: s.id,
    nom: renseigne(s.coll) ?? renseigne(s.nom) ?? 'Service non nommé',
    entite: renseigne(s.coll) ? entite : null,
    mode: modeGestion(s.mode),
    exploitant: renseigne(s.op),
    prix: s.ind['D102.0'] ?? null,
    annee,
  }
}

/** Nombre minimal de services déclarants pour qu'une médiane nationale soit tracée ou citée. */
export const SEUIL_DECLARANTS = 3000

/**
 * Séries nationales des médianes de prix et de rendement depuis 2008 : extractions annuelles quand elles
 * sont assez déclarées, sinon API Hub'Eau, avec le même seuil. Une année sous le seuil vaut null (trou
 * visible) ; les années de bord sans aucune médiane sont retirées de l'axe.
 */
export function serieMedianes(nat: SispeaNationalFile) {
  const med = (a: string, ind: 'prix' | 'rend', code: string) => {
    const x = nat.annees[a]?.[ind]
    if (x && (x.n ?? 0) >= SEUIL_DECLARANTS) return x.p50
    const api = nat.serie_api[a]?.[code]
    return api && (api.n ?? 0) >= SEUIL_DECLARANTS ? api.p50 : null
  }
  const tous = Array.from(new Set([...Object.keys(nat.serie_api), ...Object.keys(nat.annees)])).sort()
  const avec = tous.filter((a) => med(a, 'prix', 'D102.0') != null || med(a, 'rend', 'P104.3') != null)
  const years = avec.length ? tous.filter((a) => a >= avec[0] && a <= avec[avec.length - 1]) : []
  return { years, prix: years.map((a) => med(a, 'prix', 'D102.0')), rend: years.map((a) => med(a, 'rend', 'P104.3')) }
}

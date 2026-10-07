/**
 * Recherche unique (maquette du 23/09) : communes, services d'eau et syndicats, réseaux de distribution, résultats
 * groupés par type. Rang : code exact, nom exact, début du nom, début d'un mot, contenu ; à rang égal, le poids —
 * population de la commune, habitants desservis par le service, communes desservies par le réseau —, puis le nom
 * le plus court. « renn » propose d'abord Rennes (question laissée ouverte par l'étude UX du 23/09).
 *
 * Codes postaux (lot 2 de la refonte, 05/10) : taper « 02100 », le code postal de Saint-Quentin, menait à Bony, dont c'est
 * le code INSEE. Cinq chiffres proposent d'abord les communes de ce code postal, puis la commune dont c'est le code INSEE,
 * dite comme telle (`motifCode`) ; une saisie qui désigne plusieurs fiches n'en ouvre aucune sans choix (`choixRequis`).
 */

export type TypeResultat = 'commune' | 'service' | 'reseau'

export interface Entree {
  type: TypeResultat
  /** identifiant de la fiche, trouvé tel quel : code INSEE, identifiant SISPEA, code du réseau */
  id: string
  nom: string
  /** poids à rang égal, le plus grand d'abord ; sert au classement, jamais affiché */
  poids: number
  /** codes postaux d'une commune (base officielle de La Poste), triés */
  cp?: readonly string[]
}

/** Entrée dont le nom a été mis sous sa forme de comparaison, une fois pour toutes au chargement. */
export interface EntreeIndexee extends Entree {
  cle: string
}

export const GROUPES: readonly { type: TypeResultat; titre: string; max: number }[] = [
  { type: 'commune', titre: 'Communes', max: 6 },
  { type: 'service', titre: 'Services d’eau et syndicats', max: 4 },
  { type: 'reseau', titre: 'Réseaux de distribution', max: 4 },
]

const SAINTS: Record<string, string> = { st: 'saint', ste: 'sainte' }

/**
 * Forme de comparaison : sans accents ni casse, « œ » et « æ » écrits en deux lettres, ponctuation et tirets
 * réduits à une espace, « St » et « Ste » développés (les noms des réseaux les abrègent). Le dernier mot d'une
 * requête en cours de frappe n'est pas développé : « st » doit encore trouver Strasbourg.
 */
export function normaliser(s: string, dernierMotComplet = true): string {
  const mots = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
  return mots.map((m, i) => (dernierMotComplet || i < mots.length - 1 ? (SAINTS[m] ?? m) : m)).join(' ')
}

export function indexer<T extends Entree>(entrees: readonly T[]): (T & EntreeIndexee)[] {
  return entrees.map((e) => ({ ...e, cle: normaliser(e.nom) }))
}

/** Code postal tapé : cinq chiffres, espaces ignorées (« 02 100 ») ; null sinon. */
export function codePostal(requete: string): string | null {
  const c = requete.replace(/\s+/g, '')
  return /^\d{5}$/.test(c) ? c : null
}

/**
 * Raison pour laquelle une commune répond à un code tapé : son code postal, ou son code INSEE ; null pour un nom. La
 * liste le dit (« Saint-Quentin · 02100 », « code INSEE 02100 ») : les deux codes ont la même forme.
 */
export function motifCode(e: Entree, requete: string): 'postal' | 'insee' | null {
  if (e.type !== 'commune') return null
  const cp = codePostal(requete)
  if (cp && e.cp?.includes(cp)) return 'postal'
  return e.id.toUpperCase() === requete.trim().toUpperCase() ? 'insee' : null
}

/**
 * Rang d'une entrée pour une requête normalisée ; -1 si elle ne correspond pas. Une commune de ce code postal passe en
 * tête, puis le code exact (INSEE, SISPEA, réseau). Pour les services et les réseaux,
 * début du nom et début d'un mot se valent : leurs noms commencent par une forme juridique ou un trajet (« Syndicat
 * des eaux de… », « CEBR_VILLEJEAN/…_RENNES »), et le poids départage — sans quoi « renn » remplissait le groupe
 * de petites régies « Renn… » et écartait la collectivité de Rennes.
 */
function rang(e: EntreeIndexee, q: string, code: string, postal: string | null): number {
  if (postal && e.cp?.includes(postal)) return 0
  if (e.id.toUpperCase() === code) return 1
  if (e.cle === q) return 2
  if (e.cle.startsWith(q)) return 3
  if (` ${e.cle}`.includes(` ${q}`)) return e.type === 'commune' ? 4 : 3
  return e.cle.includes(q) ? 5 : -1
}

/**
 * Résultats groupés par type, dans l'ordre des groupes ; un groupe sans résultat est omis. Pour un code postal, les
 * communes ne s'arrêtent pas à six : toutes celles du code (jusqu'à 46, 51300), puis celle dont c'est le code INSEE.
 */
export function chercher<T extends EntreeIndexee>(requete: string, index: readonly T[]): { type: TypeResultat; titre: string; entrees: T[] }[] {
  const q = normaliser(requete, false)
  if (!q) return []
  const code = requete.trim().toUpperCase()
  const postal = codePostal(requete)
  const trouves = new Map<TypeResultat, { e: T; r: number }[]>()
  for (const e of index) {
    const r = rang(e, q, postal ?? code, postal)
    if (r < 0) continue
    const liste = trouves.get(e.type)
    if (liste) liste.push({ e, r })
    else trouves.set(e.type, [{ e, r }])
  }
  return GROUPES.flatMap((g) => {
    const liste = trouves.get(g.type)
    if (!liste) return []
    liste.sort((a, b) => a.r - b.r || b.e.poids - a.e.poids || a.e.nom.length - b.e.nom.length || a.e.nom.localeCompare(b.e.nom, 'fr'))
    const max = postal && g.type === 'commune' ? Math.max(g.max, liste.filter((x) => x.r <= 1).length) : g.max
    return [{ type: g.type, titre: g.titre, entrees: liste.slice(0, max).map((x) => x.e) }]
  })
}

/**
 * Une saisie de code postal qui désigne plusieurs fiches (les communes de ce code, la commune dont c'est le code INSEE,
 * un service d'eau de même identifiant) n'en ouvre aucune sans un choix dans la liste : ni Entrée ni le bouton ne prennent
 * d'office la première.
 */
export function choixRequis(requete: string, groupes: readonly { entrees: readonly unknown[] }[]): boolean {
  return codePostal(requete) != null && groupes.reduce((n, g) => n + g.entrees.length, 0) > 1
}

// --- Fichiers de l'index (pipeline/robinet/recherche.py) -----------------------------------------------------------

/**
 * Colonne de codes écrite en écarts par le pipeline (`ecarts`) : un nombre est l'écart au code précédent, de même
 * préfixe et de même largeur de chiffres ; une chaîne, un code complet. Les codes des communes y passent de 79 à 4 Ko
 * compressés.
 */
export type CodesEnEcarts = (string | number)[]

export function relireCodes(d: readonly (string | number)[]): string[] {
  const codes: string[] = []
  let prefixe = ''
  let largeur = 0
  let valeur = 0
  for (const x of d) {
    if (typeof x === 'string') {
      const m = /^(.*?)(\d+)$/.exec(x)
      ;[prefixe, largeur, valeur] = m ? [m[1], m[2].length, Number(m[2])] : [x, 0, 0]
      codes.push(x)
    } else {
      valeur += x
      codes.push(prefixe + String(valeur).padStart(largeur, '0'))
    }
  }
  return codes
}

/** recherche/communes.json : codes (en écarts), noms, poids et codes postaux, en colonnes, par code. */
export interface FichierCommunes {
  c: CodesEnEcarts
  n: string[]
  p: number[]
  /** codes postaux : un (chaîne), plusieurs (liste) ou aucun (null) ; absents d'un index antérieur au 05/10 */
  z?: (string | string[] | null)[]
}
/** recherche/services.json : identifiants (en écarts), collectivités, entités, départements, poids et modes. */
export interface FichierServices {
  i: CodesEnEcarts
  n: (string | null)[]
  e: (string | null)[]
  d: (string | null)[]
  p: number[]
  m: ('regie' | 'delegation' | null)[]
}
/** recherche/reseaux.json : codes (en écarts), noms et communes desservies, en colonnes, par code. */
export interface FichierReseaux {
  c: CodesEnEcarts
  n: string[]
  k: number[]
}

/** Entrée d'une fiche, avec de quoi écrire sa précision à l'affichage (fonction `precision`). */
export interface EntreeFiche extends Entree {
  /** département, au format des contours (« 35 », « 2A », « 971 ») */
  dept: string | null
  detail: string | null
}

export const deptDeCommune = (insee: string) => (insee.startsWith('97') ? insee.slice(0, 3) : insee.slice(0, 2))
/** Département d'un code de réseau SISE (« 035004230 » → « 35 », « 02A000100 » → « 2A », « 971000123 » → « 971 »). */
export const deptDeReseau = (code: string) => (code.startsWith('0') ? code.slice(1, 3) : code.slice(0, 3))

/** Codes postaux d'une commune en précision : « 02100 », « 35000, 35200, 35700 », « 75001 et 20 autres codes postaux ». */
export function textePostaux(cp: readonly string[]): string | null {
  if (!cp.length) return null
  return cp.length <= 3 ? cp.join(', ') : `${cp[0]} et ${cp.length - 1} autres codes postaux`
}

export function entreesCommunes(f: FichierCommunes): EntreeFiche[] {
  return relireCodes(f.c).map((id, i) => {
    const z = f.z?.[i]
    const cp = z == null ? [] : typeof z === 'string' ? [z] : z
    // Le code postal, que chacun connaît, en précision ; le code INSEE quand la base de La Poste n'en donne pas.
    return { type: 'commune', id, nom: f.n[i], poids: f.p[i] ?? 0, cp, dept: deptDeCommune(id), detail: textePostaux(cp) ?? `code INSEE ${id}` }
  })
}

// Même libellé que les fiches (libelleMode, lib/sispea.ts) : une société publique locale est déléguée sans être privée.
const MODES = { regie: 'régie', delegation: 'gestion déléguée' } as const

export function entreesServices(f: FichierServices): EntreeFiche[] {
  return relireCodes(f.i).map((id, i) => {
    const entite = f.e[i]
    const mode = f.m[i]
    return {
      type: 'service',
      id,
      nom: f.n[i] ?? entite ?? id,
      poids: f.p[i] ?? 0,
      dept: f.d[i],
      detail: [entite, mode && MODES[mode]].filter(Boolean).join(' · ') || null,
    }
  })
}

export function entreesReseaux(f: FichierReseaux): EntreeFiche[] {
  return relireCodes(f.c).map((id, i) => {
    const n = f.k[i]
    return { type: 'reseau', id, nom: f.n[i], poids: n, dept: deptDeReseau(id), detail: `${n} commune${n > 1 ? 's' : ''} desservie${n > 1 ? 's' : ''}` }
  })
}

/** Précision écrite sous le nom : département (son nom quand on l'a), puis le détail. */
export function precision(e: EntreeFiche, departements?: Record<string, string> | null): string {
  return [e.dept ? (departements?.[e.dept] ?? e.dept) : null, e.detail].filter(Boolean).join(' · ')
}

/**
 * Nom et précision d'un résultat pour la requête tapée : « Saint-Quentin · 02100 » et « Aisne · code postal » pour une
 * commune de ce code postal ; « Bony » et « Aisne · code INSEE 02100 » pour la commune dont c'est le code INSEE.
 */
export function libelleResultat(e: EntreeFiche, requete: string, departements?: Record<string, string> | null): { nom: string; meta: string } {
  const motif = motifCode(e, requete)
  const dept = e.dept ? (departements?.[e.dept] ?? e.dept) : null
  if (motif === 'postal') return { nom: `${e.nom} · ${codePostal(requete)}`, meta: [dept, 'code postal'].filter(Boolean).join(' · ') }
  if (motif === 'insee') return { nom: e.nom, meta: [dept, `code INSEE ${e.id}`].filter(Boolean).join(' · ') }
  return { nom: e.nom, meta: precision(e, departements) }
}

/** Adresse de la fiche d'un résultat. */
export const lienFiche = (e: Entree) => `/${e.type}/${e.id}`

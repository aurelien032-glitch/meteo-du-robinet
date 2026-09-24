/**
 * Recherche unique (maquette du 23/09) : communes, services d'eau et syndicats, réseaux de distribution, résultats
 * groupés par type. Rang : code exact, nom exact, début du nom, début d'un mot, contenu ; à rang égal, le poids —
 * population de la commune, habitants desservis par le service, communes desservies par le réseau —, puis le nom
 * le plus court. « renn » propose d'abord Rennes (question laissée ouverte par l'étude UX du 23/09).
 */

export type TypeResultat = 'commune' | 'service' | 'reseau'

export interface Entree {
  type: TypeResultat
  /** identifiant de la fiche, trouvé tel quel : code INSEE, identifiant SISPEA, code du réseau */
  id: string
  nom: string
  /** poids à rang égal, le plus grand d'abord ; sert au classement, jamais affiché */
  poids: number
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

/**
 * Rang d'une entrée pour une requête normalisée ; -1 si elle ne correspond pas. Pour les services et les réseaux,
 * début du nom et début d'un mot se valent : leurs noms commencent par une forme juridique ou un trajet (« Syndicat
 * des eaux de… », « CEBR_VILLEJEAN/…_RENNES »), et le poids départage — sans quoi « renn » remplissait le groupe
 * de petites régies « Renn… » et écartait la collectivité de Rennes.
 */
function rang(e: EntreeIndexee, q: string, code: string): number {
  if (e.id.toUpperCase() === code) return 0
  if (e.cle === q) return 1
  if (e.cle.startsWith(q)) return 2
  if (` ${e.cle}`.includes(` ${q}`)) return e.type === 'commune' ? 3 : 2
  return e.cle.includes(q) ? 4 : -1
}

/** Résultats groupés par type, dans l'ordre des groupes ; un groupe sans résultat est omis. */
export function chercher<T extends EntreeIndexee>(requete: string, index: readonly T[]): { type: TypeResultat; titre: string; entrees: T[] }[] {
  const q = normaliser(requete, false)
  if (!q) return []
  const code = requete.trim().toUpperCase()
  const trouves = new Map<TypeResultat, { e: T; r: number }[]>()
  for (const e of index) {
    const r = rang(e, q, code)
    if (r < 0) continue
    const liste = trouves.get(e.type)
    if (liste) liste.push({ e, r })
    else trouves.set(e.type, [{ e, r }])
  }
  return GROUPES.flatMap((g) => {
    const liste = trouves.get(g.type)
    if (!liste) return []
    liste.sort((a, b) => a.r - b.r || b.e.poids - a.e.poids || a.e.nom.length - b.e.nom.length || a.e.nom.localeCompare(b.e.nom, 'fr'))
    return [{ type: g.type, titre: g.titre, entrees: liste.slice(0, g.max).map((x) => x.e) }]
  })
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

/** recherche/communes.json : codes (en écarts), noms et poids, en colonnes, par code. */
export interface FichierCommunes {
  c: CodesEnEcarts
  n: string[]
  p: number[]
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

export function entreesCommunes(f: FichierCommunes): EntreeFiche[] {
  return relireCodes(f.c).map((id, i) => ({ type: 'commune', id, nom: f.n[i], poids: f.p[i] ?? 0, dept: deptDeCommune(id), detail: id }))
}

const MODES = { regie: 'régie', delegation: 'délégation' } as const

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

/** Adresse de la fiche d'un résultat. */
export const lienFiche = (e: Entree) => `/${e.type}/${e.id}`

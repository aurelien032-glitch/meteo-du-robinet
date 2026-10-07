/**
 * Accès direct à l'API Hub'Eau « qualité de l'eau potable » depuis le navigateur (CORS ouvert).
 * Sert la vue détaillée « toutes les analyses réglementaires » d'une commune, trop volumineuse pour être
 * stockée en statique pour 35 000 communes. Plafond Hub'Eau : 20 000 lignes par requête, d'où le découpage
 * par trimestre puis par mois quand une commune dépasse ce seuil (grandes villes).
 */
const BASE = 'https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis'
// Libellés et unités viennent de params.json (même référentiel) : les demander ici doublerait le volume.
// Le temps de réponse de Hub'Eau dépend surtout du nombre de lignes, d'où le découpage par trimestre au-delà de 4 000.
const FIELDS = [
  'code_parametre', 'resultat_numerique', 'resultat_alphanumerique',
  'limite_qualite_parametre', 'reference_qualite_parametre', 'date_prelevement', 'code_prelevement',
  'conclusion_conformite_prelevement', 'conformite_limites_bact_prelevement', 'conformite_limites_pc_prelevement',
  'nom_distributeur', 'reseaux',
].join(',')
const CAP = 20000
const SPLIT = 4000

export interface Analyse {
  code_parametre: string
  resultat_numerique: number | null
  resultat_alphanumerique: string | null
  limite_qualite_parametre: string | null
  reference_qualite_parametre: string | null
  date_prelevement: string
  code_prelevement: string
  conclusion_conformite_prelevement: string | null
  conformite_limites_bact_prelevement: string | null
  conformite_limites_pc_prelevement: string | null
  nom_distributeur: string | null
  reseaux: { code: string; nom: string }[] | null
}

/**
 * Délai d'une requête : Hub'Eau surchargé répondait 503 au bout de 34 s, et quatre reprises sans délai faisaient attendre
 * l'erreur près de trois minutes (2026-10-06).
 */
const DELAI_REQUETE = 20_000

/** Erreur de Hub'Eau : `http` (code renvoyé), `delai` (pas de réponse à temps) ou `reseau` (connexion impossible). */
export class ErreurHubeau extends Error {
  constructor(
    readonly sorte: 'http' | 'delai' | 'reseau',
    readonly statut?: number,
  ) {
    super(sorte === 'http' ? `HTTP ${statut}` : sorte)
  }
}

async function getJson(url: string, tries = 3): Promise<{ count: number; data: Analyse[] }> {
  let lastErr: ErreurHubeau = new ErreurHubeau('reseau')
  for (let i = 0; i < tries; i++) {
    const arret = new AbortController()
    const minuterie = setTimeout(() => arret.abort(), DELAI_REQUETE)
    try {
      const r = await fetch(url, { signal: arret.signal })
      // Le délai vaut pour la réponse du serveur, pas pour le téléchargement d'un gros résultat (20 000 lignes).
      clearTimeout(minuterie)
      if (r.status === 200 || r.status === 206) return (await r.json()) as { count: number; data: Analyse[] }
      if (r.status === 404) return { count: 0, data: [] }
      lastErr = new ErreurHubeau('http', r.status)
    } catch (e) {
      lastErr = new ErreurHubeau(e instanceof DOMException && e.name === 'AbortError' ? 'delai' : 'reseau')
    } finally {
      clearTimeout(minuterie)
    }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)))
  }
  throw lastErr
}

/** L'erreur dite au visiteur, sans code technique en tête. */
export function messageErreurHubeau(e: unknown): string {
  const x = e instanceof ErreurHubeau ? e : null
  if (x?.sorte === 'http' && (x.statut ?? 0) >= 500)
    return `Le service Hub’Eau, qui fournit le détail des analyses, est momentanément indisponible (erreur ${x.statut}).`
  if (x?.sorte === 'http') return `Le service Hub’Eau a refusé la demande (erreur ${x.statut}).`
  if (x?.sorte === 'delai') return 'Le service Hub’Eau, qui fournit le détail des analyses, n’a pas répondu dans le délai de 20 secondes.'
  return 'Le service Hub’Eau, qui fournit le détail des analyses, est injoignable depuis ce navigateur.'
}

/**
 * Filtre de la requête : les réseaux qui desservent la commune cette année-là quand ils sont connus (2026-10-05 : par
 * commune, Hub'Eau ne rend que les prélèvements rattachés à cette commune ; à Chevigny-Saint-Sauveur en 2024, aucun des
 * prélèvements de pesticides de son réseau, rattachés à Dijon ou à Neuilly-Crimolois), sinon la commune.
 */
function filtre(commune: string, reseaux: readonly string[]): string {
  return reseaux.length ? `code_reseau=${reseaux.join(',')}` : `code_commune=${commune}`
}

function url(f: string, from: string, to: string, size: number): string {
  return `${BASE}?${f}&date_min_prelevement=${from}&date_max_prelevement=${to}&size=${size}&fields=${FIELDS}`
}

function lastDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

const memo = new Map<string, Analyse[]>()

/**
 * Toutes les analyses de l'eau d'une commune sur une année : celles des réseaux qui la desservent (`reseaux`), sinon
 * celles rattachées à la commune, en respectant le plafond de 20 000 lignes. Mémorisé par session.
 */
export async function fetchAnalysesCommune(
  commune: string,
  year: number,
  onProgress?: (done: number, total: number) => void,
  reseaux: readonly string[] = [],
): Promise<Analyse[]> {
  const f = filtre(commune, reseaux)
  const key = `${f}-${year}`
  const cached = memo.get(key)
  if (cached) return cached
  const rows = await fetchUncached(f, year, onProgress)
  memo.set(key, rows)
  return rows
}

async function fetchUncached(f: string, year: number, onProgress?: (done: number, total: number) => void): Promise<Analyse[]> {
  const head = await getJson(url(f, `${year}-01-01`, `${year}-12-31`, 1))
  const total = head.count
  if (total === 0) return []
  onProgress?.(0, total)
  const windows: [string, string][] = []
  if (total <= SPLIT) windows.push([`${year}-01-01`, `${year}-12-31`])
  else if (total <= CAP * 4) for (let q = 0; q < 4; q++) windows.push([`${year}-${String(q * 3 + 1).padStart(2, '0')}-01`, lastDay(year, q * 3 + 3)])
  else for (let m = 1; m <= 12; m++) windows.push([`${year}-${String(m).padStart(2, '0')}-01`, lastDay(year, m)])
  // Les fenêtres partent en parallèle : une grande ville met 15 à 20 s en une seule requête, 4 à 5 s en trimestres.
  let done = 0
  const parts = await Promise.all(
    windows.map(async ([from, to]) => {
      const part = await getJson(url(f, from, to, CAP))
      done += part.data.length
      onProgress?.(done, total)
      return part.data
    }),
  )
  return parts.flat()
}

/** Borne numérique d'un seuil SISE-Eaux : « <=50 mg/L » → { max: 50 }, « >=6,5 et <=9 unité pH » → { min: 6.5, max: 9 }. */
export function parseSeuil(s: string | null | undefined): { min?: number; max?: number } {
  if (!s) return {}
  const num = (m: RegExpMatchArray | null) => (m ? Number(m[1].replace(',', '.')) : undefined)
  const max = num(s.match(/<=\s*([0-9]+(?:[,.][0-9]+)?)/))
  const min = num(s.match(/>=\s*([0-9]+(?:[,.][0-9]+)?)/))
  const r: { min?: number; max?: number } = {}
  if (max != null && !Number.isNaN(max)) r.max = max
  if (min != null && !Number.isNaN(min)) r.min = min
  return r
}

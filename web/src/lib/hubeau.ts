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

async function getJson(url: string, tries = 4): Promise<{ count: number; data: Analyse[] }> {
  let lastErr: unknown = null
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.status === 200 || r.status === 206) return (await r.json()) as { count: number; data: Analyse[] }
      if (r.status === 404) return { count: 0, data: [] }
      lastErr = new Error(`HTTP ${r.status}`)
    } catch (e) {
      lastErr = e
    }
    await new Promise((res) => setTimeout(res, 800 * (i + 1)))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function url(commune: string, from: string, to: string, size: number): string {
  return `${BASE}?code_commune=${commune}&date_min_prelevement=${from}&date_max_prelevement=${to}&size=${size}&fields=${FIELDS}`
}

function lastDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

const memo = new Map<string, Analyse[]>()

/** Toutes les analyses d'une commune sur une année, en respectant le plafond de 20 000 lignes. Mémorisé par session. */
export async function fetchAnalysesCommune(commune: string, year: number, onProgress?: (done: number, total: number) => void): Promise<Analyse[]> {
  const key = `${commune}-${year}`
  const cached = memo.get(key)
  if (cached) return cached
  const rows = await fetchUncached(commune, year, onProgress)
  memo.set(key, rows)
  return rows
}

async function fetchUncached(commune: string, year: number, onProgress?: (done: number, total: number) => void): Promise<Analyse[]> {
  const head = await getJson(url(commune, `${year}-01-01`, `${year}-12-31`, 1))
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
      const part = await getJson(url(commune, from, to, CAP))
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

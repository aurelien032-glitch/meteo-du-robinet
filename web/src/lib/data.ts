/** Chargement des fichiers statiques produits par le pipeline (web/public/data/). */
const cache = new Map<string, Promise<unknown>>()

export function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`.replace(/\/{2,}/g, '/')
}

export function loadJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(dataUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
      return r.json()
    })
    // Un échec (blip réseau, fichier pas encore construit) n'est pas gardé en cache : sans ce nettoyage,
    // toute demande suivante du même fichier — une autre page, un remontage — rejouerait le même échec
    // pour le reste de la session au lieu de retenter la requête.
    p.then(
      () => {
        if (echecs.delete(path)) signaler()
      },
      (e) => {
        cache.delete(path)
        echecs.set(path, { message: String(e), t: Date.now() })
        signaler()
      },
    )
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

/**
 * Registre des fichiers en échec, lu par <Chargement> : une page qui attend encore ses données affiche
 * l'échec au lieu d'un « Chargement… » sans fin. Un succès ultérieur du même fichier l'efface.
 */
const echecs = new Map<string, { message: string; t: number }>()
const abonnes = new Set<() => void>()
let instantane: [string, { message: string; t: number }][] = []
function signaler() {
  instantane = [...echecs.entries()]
  abonnes.forEach((f) => f())
}
export const registreEchecs = {
  abonner: (f: () => void) => {
    abonnes.add(f)
    return () => abonnes.delete(f)
  },
  lire: () => instantane,
}

/**
 * Accord en nombre : le pluriel commence à 2 (« 0 analyse », « 1 réseau », « 2 réseaux »). Pour un libellé
 * affiché sous un chiffre (tuile) ; un chiffre suivi de son nom passe par `fmt.nb`.
 */
export function accord(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return Math.abs(n) >= 2 ? pluriel : singulier
}

/** Formats français : 12345 → « 12 345 », 0.1234 → « 0,12 ». */
export const fmt = {
  /** Effectif suivi de son nom accordé : « 1 analyse », « 1 234 analyses », « 3 réseaux ». */
  nb: (n: number, singulier: string, pluriel?: string) => `${fmt.int(n)} ${accord(n, singulier, pluriel)}`,
  int: (n: number | null | undefined) => (n == null ? '–' : new Intl.NumberFormat('fr-FR').format(Math.round(n))),
  dec: (n: number | null | undefined, d = 1) =>
    n == null
      ? '–'
      : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n),
  pct: (n: number | null | undefined, d = 1) => (n == null ? '–' : `${fmt.dec(n, d)} %`),
  /** Part (0–1) en borne de légende : décimale seulement si elle est utile (« 0,5 % », « 5 % », jamais « 5,0 % »). */
  pctBorne: (v: number) => fmt.pct(100 * v, Number.isInteger(Math.round(1000 * v) / 10) ? 0 : 1),
  /** Nombre à trois chiffres significatifs au plus (« 45 », « 6,4 », « 0,061 »), sans zéros de remplissage. */
  sig: (n: number | null | undefined, chiffres = 3) =>
    n == null ? '–' : new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: chiffres }).format(n),
  /** Seuil réglementaire lisible : « <=50 mg/L » → « ≤ 50 mg/L ». */
  seuil: (s: string | null | undefined) =>
    s == null ? '–' : s.replace(/<=\s*/g, '≤ ').replace(/>=\s*/g, '≥ ').replace(/(\d)\.(\d)/g, '$1,$2'),
  /** Date ISO en date française : « 2025-09-16 » → « 16/09/2025 ». */
  date: (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
}

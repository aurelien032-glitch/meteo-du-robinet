import { fmt } from './data'
import { NBSP, niceCeil, type FamilleReseau } from './instruments'
import { codeFamille, toneSituation, type Ton } from './situations'
import type { CommuneYearStats, SeriesDeptFile } from './types'

/**
 * Série « mois par mois » d'une fiche (maquette du 23/09) : une seule, celle qui explique le bulletin du réseau
 * affiché, sur l'année choisie. Nitrates dès qu'ils sont en réserve (25 à 50 mg/L) ou en cause ; PFAS en
 * dépassement ; total des pesticides seulement s'il a lui-même dépassé sa limite — sinon ce sont d'autres
 * substances qui ont fait la classe, et la série ne les montrerait pas. Ni bactériologie (limite à zéro : des
 * maxima mensuels ne sont pas la bonne forme) ni métaux (un paramètre par limite). Le plus grave d'abord, puis
 * l'ordre du bulletin.
 */
const CANDIDATS: { famille: FamilleReseau; parametre: string }[] = [
  { famille: 'pesticides', parametre: '6276' },
  { famille: 'azote', parametre: '1340' },
  { famille: 'pfas', parametre: '8847' },
]
const GRAVITE: Record<Ton, number> = { bad: 0, warn: 1, good: 2 }

export function parametreSerie(code: string | null | undefined, stats: CommuneYearStats | undefined): { famille: FamilleReseau; parametre: string } | null {
  const retenus = CANDIDATS.flatMap((c) => {
    const classe = codeFamille(code, c.famille)
    if (!classe) return []
    if (c.famille === 'pesticides' && !(stats?.dep ?? []).some(([p]) => p === c.parametre)) return []
    return [{ ...c, gravite: GRAVITE[toneSituation(c.famille, classe)] }]
  })
  const [premier] = retenus.sort((a, b) => a.gravite - b.gravite)
  return premier ? { famille: premier.famille, parametre: premier.parametre } : null
}

export interface MoisSerie {
  /** « 2025-08 » */
  mois: string
  max: number | null
  analyses: number
  depassements: number
}

/** Les mois de l'année choisie pour un réseau et un paramètre ; null si le fichier n'a pas ce couple ou cette année. */
export function serieAnnee(fichier: SeriesDeptFile, reseau: string, parametre: string, annee: string | number): MoisSerie[] | null {
  const s = fichier.reseaux[reseau]?.[parametre]
  if (!s) return null
  const a = String(annee)
  const mois = fichier.mois.flatMap((m, i) => (m.startsWith(a) ? [{ m, i }] : []))
  if (!mois.length) return null
  return mois.map(({ m, i }) => ({ mois: m, max: s.max[i] ?? null, analyses: s.n[i] ?? 0, depassements: s.nd[i] ?? 0 }))
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Nom d'un mois « 2025-08 » → « août ». */
export const nomMois = (mois: string) => NOMS_MOIS[Number(mois.slice(5, 7)) - 1] ?? mois

/** Ce que la série dit en une phrase : analyses, dépassements, mois touchés, maximum et son mois (le premier en cas d'égalité). */
export function resumeSerie(serie: readonly MoisSerie[]): { analyses: number; depassements: number; moisAvecDepassement: number; maximum: number | null; moisDuMaximum: string | null } {
  let maximum: number | null = null
  let moisDuMaximum: string | null = null
  for (const x of serie) {
    if (x.max != null && (maximum == null || x.max > maximum)) {
      maximum = x.max
      moisDuMaximum = x.mois
    }
  }
  return {
    analyses: serie.reduce((t, x) => t + x.analyses, 0),
    depassements: serie.reduce((t, x) => t + x.depassements, 0),
    moisAvecDepassement: serie.filter((x) => x.depassements > 0).length,
    maximum,
    moisDuMaximum,
  }
}

/**
 * Série de plusieurs réseaux, pour les petits multiples du détail d'une fiche commune : maximum du mois sur
 * l'ensemble, analyses et dépassements additionnés (chaque réseau a ses propres prélèvements). null si aucun des
 * réseaux n'a ce paramètre cette année-là.
 */
export function serieReseaux(fichier: SeriesDeptFile, reseaux: readonly string[], parametre: string, annee: string | number): MoisSerie[] | null {
  const series = reseaux.map((r) => serieAnnee(fichier, r, parametre, annee)).filter((s): s is MoisSerie[] => s != null)
  if (!series.length) return null
  return series[0].map((m, i) => ({
    mois: m.mois,
    max: series.reduce<number | null>((acc, s) => (s[i].max != null && (acc == null || s[i].max! > acc) ? s[i].max : acc), null),
    analyses: series.reduce((t, s) => t + s[i].analyses, 0),
    depassements: series.reduce((t, s) => t + s[i].depassements, 0),
  }))
}

/** Paramètres analysés au moins une fois dans l'année sur ces réseaux, dans l'ordre du fichier. */
export function parametresMesures(fichier: SeriesDeptFile, reseaux: readonly string[], annee: string | number): string[] {
  return fichier.params.filter((p) => serieReseaux(fichier, reseaux, p, annee)?.some((m) => m.analyses > 0))
}

/**
 * Échelle verticale d'une série : de 0 à une borne ronde qui montre toujours la limite (20 % de marge) et le plus haut
 * maximum (10 %) ; graduations rondes, trois ou quatre.
 */
export function echelleSerie(maximum: number | null, limite: number | null): { haut: number; graduations: number[] } {
  const brut = Math.max(limite != null ? limite * 1.2 : 0, maximum != null ? maximum * 1.1 : 0)
  const haut = brut > 0 ? niceCeil(brut) : 1
  const p = 10 ** Math.floor(Math.log10(haut / 4))
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= haut / 4 - 1e-12) ?? haut
  const graduations: number[] = []
  for (let i = 1; i * pas <= haut * (1 + 1e-9); i++) graduations.push(Number((i * pas).toPrecision(12)))
  return { haut, graduations }
}

/** Ce que dit la série en une phrase, sous le graphique : analyses, dépassements et mois touchés, maximum et son mois. */
export function phraseSerie(serie: readonly MoisSerie[], annee: string | number, unite: string): string {
  const r = resumeSerie(serie)
  if (!r.analyses) return `Aucune analyse en ${annee}.`
  const depasse = r.depassements
    ? `, dont ${fmt.int(r.depassements)} au-dessus de la limite, sur ${fmt.nb(r.moisAvecDepassement, 'mois', 'mois')}`
    : ', aucune au-dessus de la limite'
  const max = r.maximum != null ? ` ; maximum ${fmt.sig(r.maximum)}${unite ? `${NBSP}${unite}` : ''} en ${nomMois(r.moisDuMaximum!)}` : ''
  return `${fmt.nb(r.analyses, 'analyse')} en ${annee}${depasse}${max}.`
}

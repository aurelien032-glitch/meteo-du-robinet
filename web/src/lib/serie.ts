import { fmt } from './data'
import { parseSeuil } from './hubeau'
import { NBSP, familleBulletin, niceCeil, type FamilleReseau } from './instruments'
import { libelleParametre } from './parametres'
import { codeFamille, estPartiel, horsJugement, sansLimite, toneSituation, type Ton } from './situations'
import type { CommuneYearStats, ParamInfo, SeriesReseauxFile } from './types'

const NITRATES = '1340'

/**
 * Séries « mois par mois » sous le bulletin (maquette du 23/09, choix de l'auteur du 03/10) : un graphique par famille
 * en cause dans le bulletin du réseau affiché, non conforme ou avec une réserve, le plus grave d'abord, puis l'ordre du
 * bulletin. Chaque graphique propose les paramètres de la famille au-dessus de leur limite dans l'année, le plus
 * souvent au-dessus d'abord ; les nitrates ouvrent toujours celui de l'azote, dont ils font la classe (25 à 50 mg/L).
 * Ni la bactériologie (limite à zéro : des maxima mensuels n'en disent rien d'utile) ni les paramètres hors du
 * jugement (canalisations, matériaux et réactifs de traitement). Seuls les paramètres publiés dans le fichier de séries.
 */
const FAMILLES_SERIE: FamilleReseau[] = ['pesticides', 'azote', 'pfas', 'metaux_mineraux', 'autres']
const GRAVITE: Record<Ton, number> = { bad: 0, warn: 1, good: 2 }

export interface GraphiqueFamille {
  famille: FamilleReseau
  /** paramètres proposés, le premier affiché par défaut */
  parametres: string[]
}

export function graphiquesBulletin(
  code: string | null | undefined,
  stats: CommuneYearStats | undefined,
  fichier: SeriesReseauxFile | null | undefined,
  reseau: string,
  params: Record<string, ParamInfo>,
): GraphiqueFamille[] {
  const publies = fichier?.reseaux[reseau]
  if (!publies) return []
  return FAMILLES_SERIE.flatMap((famille) => {
    const classe = codeFamille(code, famille)
    if (!classe) return []
    const enDepassement = (stats?.dep ?? [])
      .filter(([p, , nd]) => nd > 0 && params[p] && familleBulletin(params[p].f, p) === famille && !horsJugement(p))
      .map(([p]) => p)
    const parametres = [...new Set([...(famille === 'azote' ? [NITRATES] : []), ...enDepassement])].filter((p) => publies[p])
    return parametres.length ? [{ famille, parametres, gravite: GRAVITE[toneSituation(famille, classe)] }] : []
  })
    .sort((a, b) => a.gravite - b.gravite)
    .map(({ famille, parametres }) => ({ famille, parametres }))
}

/**
 * Les trois graphiques du détail « Mois par mois » (choix de l'auteur du 03/10) : pesticides, nitrates, PFAS, chacun
 * ouvert sur son paramètre de synthèse et proposant les autres paramètres de la famille quantifiés dans l'année.
 */
export const GRAPHIQUES_DETAIL: { famille: FamilleReseau; defaut: string }[] = [
  { famille: 'pesticides', defaut: '6276' },
  { famille: 'azote', defaut: NITRATES },
  { famille: 'pfas', defaut: '8847' },
]

/**
 * Paramètres d'une famille publiés pour ces réseaux : le paramètre par défaut s'il a été analysé, puis ceux qui ont
 * dépassé leur limite (le plus souvent d'abord), puis les autres quantifiés, par ordre alphabétique.
 */
export function parametresFamille(
  fichier: SeriesReseauxFile,
  reseaux: readonly string[],
  famille: FamilleReseau,
  defaut: string,
  params: Record<string, ParamInfo>,
): string[] {
  const depassements = new Map<string, number>()
  const quantifies = new Set<string>()
  for (const r of reseaux)
    for (const [p, mois] of Object.entries(fichier.reseaux[r] ?? {})) {
      if (p !== defaut && (!params[p] || familleBulletin(params[p].f, p) !== famille)) continue
      depassements.set(p, (depassements.get(p) ?? 0) + mois.reduce((t, m) => t + m[2], 0))
      if (mois.some((m) => (m[3] ?? 0) > 0)) quantifies.add(p)
    }
  const nom = (p: string) => libelleParametre(p, params[p]?.l)
  return [...depassements.keys()]
    .filter((p) => p === defaut || quantifies.has(p))
    .sort((a, b) => Number(b === defaut) - Number(a === defaut) || depassements.get(b)! - depassements.get(a)! || nom(a).localeCompare(nom(b), 'fr'))
}

/** Limite de qualité tracée sur la série : aucune pour un métabolite devenu non pertinent cette année-là. */
export function limiteSerie(parametre: string, info: ParamInfo | undefined, annee: string | number): number | null {
  return sansLimite(parametre, annee) ? null : (parseSeuil(info?.lim).max ?? null)
}

export interface MoisSerie {
  /** « 2025-08 » */
  mois: string
  max: number | null
  analyses: number
  depassements: number
}

/** Les douze mois du millésime du fichier pour un réseau et un paramètre ; null si le fichier n'a pas ce couple. */
export function serieAnnee(fichier: SeriesReseauxFile, reseau: string, parametre: string): MoisSerie[] | null {
  const s = fichier.reseaux[reseau]?.[parametre]
  if (!s) return null
  const parMois = new Map(s.map(([m, n, nd, max]) => [m, { max, analyses: n, depassements: nd }]))
  return Array.from({ length: 12 }, (_, i) => ({
    mois: `${fichier.annee}-${String(i + 1).padStart(2, '0')}`,
    ...(parMois.get(i + 1) ?? { max: null, analyses: 0, depassements: 0 }),
  }))
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
 * Série de plusieurs réseaux, pour le détail d'une fiche commune : maximum du mois sur l'ensemble, analyses et
 * dépassements additionnés (chaque réseau a ses propres prélèvements). null si aucun des réseaux n'a ce paramètre.
 */
export function serieReseaux(fichier: SeriesReseauxFile, reseaux: readonly string[], parametre: string): MoisSerie[] | null {
  const series = reseaux.map((r) => serieAnnee(fichier, r, parametre)).filter((s): s is MoisSerie[] => s != null)
  if (!series.length) return null
  return series[0].map((m, i) => ({
    mois: m.mois,
    max: series.reduce<number | null>((acc, s) => (s[i].max != null && (acc == null || s[i].max! > acc) ? s[i].max : acc), null),
    analyses: series.reduce((t, s) => t + s[i].analyses, 0),
    depassements: series.reduce((t, s) => t + s[i].depassements, 0),
  }))
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

/**
 * Ce que dit la série en une phrase, sous le graphique : analyses, dépassements et mois touchés, maximum et son mois.
 * Un paramètre sans limite de qualité ne dit rien des dépassements. L'année en cours s'écrit « depuis le 1er janvier 2026 »
 * (règle des années, 2026-10-06).
 */
export function phraseSerie(serie: readonly MoisSerie[], annee: string | number, unite: string, aLimite = true): string {
  const r = resumeSerie(serie)
  const periode = estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`
  if (!r.analyses) return `Aucune analyse ${periode}.`
  const depasse = !aLimite
    ? ''
    : r.depassements
      ? `, dont ${fmt.int(r.depassements)} au-dessus de la limite, sur ${fmt.nb(r.moisAvecDepassement, 'mois', 'mois')}`
      : ', aucune au-dessus de la limite'
  const max = r.maximum === 0 ? `${NBSP}; aucune valeur quantifiée` : r.maximum != null ? `${NBSP}; maximum ${fmt.sig(r.maximum)}${unite ? `${NBSP}${unite}` : ''} en ${nomMois(r.moisDuMaximum!)}` : ''
  return `${fmt.nb(r.analyses, 'analyse')} ${periode}${depasse}${max}.`
}

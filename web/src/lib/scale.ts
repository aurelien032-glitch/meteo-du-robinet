import { alerte, cleTheme, couleursEtats, couleursNotes, cssVar, div, neutre, noData, ocre } from './theme'

/**
 * Échelle de couleurs d'une carte : la fonction de coloriage et les paliers de la légende viennent
 * de la même source, pour qu'une couleur affichée soit toujours décodable dans la légende.
 *
 * Les couleurs ne sont pas figées à la construction : `color()` et `steps` interrogent la palette du
 * thème courant à chaque lecture, sans quoi une carte construite en thème clair resterait claire
 * après un passage en mode studio.
 *
 * Couleurs des cartes (choix de l'auteur du 04/10, « la palette couleur partout », qui remplace « compter en gris » du
 * 24/09) : ce qui juge ou alerte (situation d'une commune, avis de l'ARS, sécheresse) dans la palette de « Lire un
 * bulletin » ; les agrégats de la qualité de l'eau (parts, taux, dénombrements) sur la rampe bleu → jaune → rouge
 * (`rampe: 'qualite'`, `qualiteScale`) ; le contexte (SISPEA, ressource, amont) sur l'ardoise, l'ocre ou la divergente
 * neutre.
 */
export interface Scale {
  /** Couleur d'une valeur ; null ou undefined → couleur « sans donnée ». */
  color: (v: number | null | undefined) => string
  /** Paliers, du plus faible au plus fort : couleur et borne basse. Recalculé à chaque lecture. */
  readonly steps: { color: string; from: number }[]
  /** Échelle calculée sur les valeurs affichées : elle change avec le millésime ou le paramètre. */
  relative: boolean
  /** Borne haute du dernier palier, pour les légendes qui affichent un intervalle fermé. */
  to: number
  /** Le premier palier prend aussi les valeurs sous sa borne : la légende écrit « < borne suivante ». */
  ouvertBas?: boolean
}

/** Rampe d'une échelle à paliers : ardoise par défaut. */
export type Rampe = 'ocre' | 'qualite'

/**
 * Palette relue seulement quand le thème change : les jetons CSS coûtent un getComputedStyle par lecture, et
 * une carte communale colorie 35 000 entités. Une lecture incomplète (feuille de style pas encore appliquée)
 * n'est pas gardée.
 */
function memo(calc: () => string[]): () => string[] {
  let cle = ''
  let pal: string[] = []
  return () => {
    const c = cleTheme()
    if (c !== cle) {
      pal = calc()
      cle = pal.every(Boolean) ? c : ''
    }
    return pal
  }
}
const sansDonnee = memo(() => [noData()])

/**
 * Construit une échelle à partir des bornes basses de ses paliers : un palier par couleur de la rampe (ardoise, ou celle de `rampe`),
 * et `invert` la met en miroir pour les indicateurs où une valeur haute est une bonne nouvelle.
 */
function boundsScale(
  froms: number[],
  opts: { invert?: boolean; relative: boolean; to: number; ouvertBas?: boolean; rampe?: Rampe; premierAucun?: boolean },
): Scale {
  const n = froms.length
  // `premierAucun` : le premier palier (zéro) est « aucun », le gris --d0 des cartes communales (« aucun avis », « ni
  // restriction ni consigne »), et non le premier palier de la rampe (audit du 27/09 : deux gris pour « aucun avis »).
  const rampe = (k: number) => (opts.rampe === 'qualite' ? alerte(k) : neutre(k))
  const palette = memo(() => (opts.rampe === 'ocre' ? ocre(n) : opts.premierAucun ? [cssVar('--d0'), ...rampe(n - 1)] : rampe(n)))
  const couleur = (i: number) => palette()[opts.invert ? n - 1 - i : i]
  const bandOf = (v: number) => {
    let i = 0
    while (i < n - 1 && v >= froms[i + 1]) i++
    return i
  }
  return {
    color: (v) => (v == null ? sansDonnee()[0] : couleur(bandOf(v))),
    get steps() {
      return froms.map((from, i) => ({ color: couleur(i), from }))
    },
    relative: opts.relative,
    to: opts.to,
    ouvertBas: opts.ouvertBas,
  }
}

/**
 * Échelle à bornes fixes (mêmes couleurs d'une vue à l'autre) : `bounds` donne la borne basse de chaque palier. `rampe`
 * « ocre » : parts de nappes basses (lib/theme.ts, ocre) ; « qualite » : agrégats de la qualité de l'eau (taux, avis,
 * dénombrements) ; sinon la rampe ardoise. `premierAucun` : le palier zéro en --d0 (« aucun avis », « aucun réseau »
 * sous restriction), comme sur les cartes communales.
 */
export function stepScale(bounds: number[], opts: { invert?: boolean; ouvertBas?: boolean; rampe?: Rampe; premierAucun?: boolean } = {}): Scale {
  return boundsScale(bounds, { ...opts, relative: false, to: Infinity })
}

/** Pas « rond » (1, 2, 2,5 ou 5 × 10ⁿ) le plus proche de `brut` par excès. */
export function pasRond(brut: number): number {
  if (!(brut > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(brut))
  const r = brut / p
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p
}

/**
 * Échelle relative aux bornes arrondies (revue du 2026-09-22 : « 329,9–655,4 » devient « 250–500 ») :
 * pour les grandeurs sans palier fixe possible (paramètre choisi librement). Au plus sept paliers.
 */
export function niceScale(lo: number, hi: number, opts: { invert?: boolean; entier?: boolean; rampe?: Rampe } = {}): Scale {
  if (!(hi > lo)) return boundsScale([lo], { invert: opts.invert, relative: true, to: hi, rampe: opts.rampe })
  let pas = pasRond((hi - lo) / 7)
  if (opts.entier) pas = Math.max(1, Math.round(pas))
  const debut = Math.floor(lo / pas) * pas
  const froms: number[] = []
  for (let v = debut; v < hi && froms.length < 8; v += pas) froms.push(Number(v.toPrecision(12)))
  return boundsScale(froms, { invert: opts.invert, relative: true, to: hi, rampe: opts.rampe })
}

/**
 * Échelle divergente à bornes fixes, pour une évolution : `bounds` = bornes basses des sept paliers,
 * le premier ouvert vers le bas (« < −10 % »), le quatrième autour de zéro. Palette neutre (lib/theme.ts, div).
 */
export function divergingScale(bounds: number[], opts: { invert?: boolean } = {}): Scale {
  const palette = memo(div)
  const bandOf = (v: number) => {
    let i = 0
    while (i < bounds.length - 1 && v >= bounds[i + 1]) i++
    return i
  }
  const couleur = (i: number) => {
    const p = palette()
    return p[opts.invert ? p.length - 1 - i : i] ?? sansDonnee()[0]
  }
  return {
    color: (v) => (v == null ? sansDonnee()[0] : couleur(bandOf(v))),
    get steps() {
      return bounds.map((from, i) => ({ color: couleur(i), from }))
    },
    relative: false,
    to: Infinity,
    ouvertBas: true,
  }
}

/**
 * Bornes basses des quatre paliers des parts agrégées, de 0 à 1 : moins de 10 %, 10 à 25, 25 à 50, 50 % et plus (auteur,
 * 2026-10-07, aux couleurs des notes : bleu clair quand presque tous les réseaux sont en règle, rouge quand la moitié au
 * moins ne le sont pas ; remplace les cinq paliers 5, 10, 20, 40 % de la rampe bleu foncé → rouge).
 */
export const PALIERS_PARTS = [0, 0.1, 0.25, 0.5] as const

/** Palier (0 à 3) d'une part ; chaque palier s'ouvre à sa borne (25 % est dans « 25 à 50 »). */
export function palierPart(part: number): number {
  let i = 0
  while (i < PALIERS_PARTS.length - 1 && part >= PALIERS_PARTS[i + 1]) i++
  return i
}

/**
 * Parts de réseaux notés C ou D ou non conformes, par département : La France, /carte, /themes, /amont, scènes vidéo.
 * Quatre paliers fixes (PALIERS_PARTS) aux couleurs des notes (`couleursNotes`, 07/10) : la carte se lit avec la barre
 * des notes ou des situations placée au-dessus. `facteur` : 100 pour des parts écrites en pourcentage (page Amont).
 */
export function qualiteScale(facteur = 1): Scale {
  return partsScale(couleursNotes, facteur)
}
function partsScale(tons: () => string[], facteur: number): Scale {
  const palette = memo(tons)
  return {
    // Sans donnée : la couleur de surface, hors de la rampe (lib/theme.ts, noData).
    color: (v) => (v == null ? sansDonnee()[0] : palette()[palierPart(v / facteur)]),
    get steps() {
      return PALIERS_PARTS.map((from, i) => ({ color: palette()[i], from: from * facteur }))
    },
    relative: false,
    to: Infinity,
    ouvertBas: true,
  }
}

/** Échelle à deux états (présence ou absence), pour les cartes communales binaires. */
export function binaryScale(): Scale {
  return boundsScale([0, 1], { relative: false, to: 1 })
}

/**
 * Échelle ordinale à niveaux nommés (0, 1, 2…) : une couleur par niveau, lue au rendu. Pour les avis de
 * l'ARS : aucun, publics sensibles, ébullition, restriction. Un binaire « avis / pas d'avis » peignait de la
 * même couleur une eau déconseillée aux nourrissons et une eau interdite à tous.
 */
export function niveauxScale(couleurs: () => string[]): Scale {
  const palette = memo(couleurs)
  return {
    color: (v) => (v == null ? sansDonnee()[0] : (palette()[v] ?? sansDonnee()[0])),
    get steps() {
      return palette().map((color, from) => ({ color, from }))
    },
    relative: false,
    to: 0,
  }
}

/**
 * Niveaux des avis de l'ARS (MapRow[14]) dans la palette de « Lire un bulletin », comme leurs étiquettes
 * (`toneAvis`) : aucun avis en gris, publics sensibles en orange, consigne d'ébullition en rouge, restriction de
 * consommation en rouge fort (le plus grave des deux degrés du rouge).
 */
export const avisScale = niveauxScale(() => couleursEtats([null, 'warn', 'bad', 'bad']))

/**
 * Communes desservies par un réseau sous restriction de consommation ou consigne d'ébullition de l'ARS (indicateur
 * « Restrictions de consommation » de /carte) : gris sans, rouge avec — une alerte, dans la palette de « Lire un
 * bulletin ».
 */
export const restrictionScale = niveauxScale(() => couleursEtats([null, 'bad']))

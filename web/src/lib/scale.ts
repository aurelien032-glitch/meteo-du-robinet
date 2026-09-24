import { ardoise, cleTheme, couleursEtats, div, neutre, noData } from './theme'

/**
 * Échelle de couleurs d'une carte : la fonction de coloriage et les paliers de la légende viennent
 * de la même source, pour qu'une couleur affichée soit toujours décodable dans la légende.
 *
 * Les couleurs ne sont pas figées à la construction : `color()` et `steps` interrogent la palette du
 * thème courant à chaque lecture, sans quoi une carte construite en thème clair resterait claire
 * après un passage en mode studio.
 *
 * Couleurs des cartes (règle « juger et alerter en couleur » de l'auteur, 24/09) : les statistiques (parts,
 * taux, dénombrements, indicateurs SISPEA) sur la rampe ardoise, les évolutions sur la divergente neutre ; ce qui
 * juge ou alerte (situation d'une commune, avis de l'ARS, sécheresse) dans la palette de « Lire un bulletin ».
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

/** Nombre de paliers visés par les échelles linéaires. */
const BANDS = 7

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
 * Construit une échelle à partir des bornes basses de ses paliers : un palier par couleur de la rampe neutre,
 * et `invert` la met en miroir pour les indicateurs où une valeur haute est une bonne nouvelle.
 */
function boundsScale(froms: number[], opts: { invert?: boolean; relative: boolean; to: number; ouvertBas?: boolean }): Scale {
  const n = froms.length
  const palette = memo(() => neutre(n))
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
 * Échelle linéaire de `lo` à `hi` en sept paliers. `invert` sert aux indicateurs où une valeur haute
 * est une bonne nouvelle (rendement d'un réseau) : la couleur forte reste du côté défavorable.
 * `entier` sert aux dénombrements : les bornes sont arrondies et les doublons fusionnés, pour ne pas
 * annoncer sept paliers « 0–0 » sur une carte qui ne peut afficher que deux couleurs.
 */
export function linearScale(lo: number, hi: number, opts: { invert?: boolean; relative?: boolean; entier?: boolean } = {}): Scale {
  const relative = opts.relative ?? true
  const span = hi - lo
  if (span <= 0) return boundsScale([lo], { invert: opts.invert, relative, to: hi })
  let froms = Array.from({ length: BANDS }, (_, i) => lo + (span * i) / BANDS)
  if (opts.entier) froms = [...new Set(froms.map(Math.round))]
  return boundsScale(froms, { invert: opts.invert, relative, to: hi })
}

/** Échelle à bornes fixes (mêmes couleurs d'une vue à l'autre) : `bounds` donne la borne basse de chaque palier. */
export function stepScale(bounds: number[], opts: { invert?: boolean; ouvertBas?: boolean } = {}): Scale {
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
export function niceScale(lo: number, hi: number, opts: { invert?: boolean; entier?: boolean } = {}): Scale {
  if (!(hi > lo)) return boundsScale([lo], { invert: opts.invert, relative: true, to: hi })
  let pas = pasRond((hi - lo) / 7)
  if (opts.entier) pas = Math.max(1, Math.round(pas))
  const debut = Math.floor(lo / pas) * pas
  const froms: number[] = []
  for (let v = debut; v < hi && froms.length < 8; v += pas) froms.push(Number(v.toPrecision(12)))
  return boundsScale(froms, { invert: opts.invert, relative: true, to: hi })
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

/** Bornes basses des cinq paliers de la rampe ardoise, en parts de 0 à 1 : moins de 5 %, 5 à 10, 10 à 20, 20 à 40, 40 % et plus. */
export const PALIERS_ARDOISE = [0, 0.05, 0.1, 0.2, 0.4] as const

/** Palier ardoise (0 à 4) d'une part ; chaque palier s'ouvre à sa borne (10 % est dans « 10 à 20 »). */
export function palierArdoise(part: number): number {
  let i = 0
  while (i < PALIERS_ARDOISE.length - 1 && part >= PALIERS_ARDOISE[i + 1]) i++
  return i
}

/**
 * Rampe ardoise des parts agrégées (grammaire du 23/09) : parts de réseaux non conformes par département sur
 * /carte, /themes et /amont, comme la carte de l'accueil (lib/carte.ts). Cinq paliers fixes, du plus clair au
 * plus foncé, lus dans les jetons --m1…--m5 : un agrégat n'a pas de sémaphore. `facteur` : 100 pour des parts
 * écrites en pourcentage (page Amont).
 */
export function ardoiseScale(facteur = 1): Scale {
  const palette = memo(ardoise)
  return {
    // Sans donnée : la couleur de surface, hors de la rampe (lib/theme.ts, noData).
    color: (v) => (v == null ? sansDonnee()[0] : palette()[palierArdoise(v / facteur)]),
    get steps() {
      return PALIERS_ARDOISE.map((from, i) => ({ color: palette()[i], from: from * facteur }))
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

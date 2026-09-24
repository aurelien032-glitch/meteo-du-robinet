import { useEffect, useState, useSyncExternalStore } from 'react'

/** Palette partagée entre le CSS (variables) et ECharts / MapLibre (valeurs lues au rendu). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function chartPalette() {
  const studio = document.documentElement.classList.contains('studio')
  return {
    /** Taille de base des textes ECharts, alignée sur l'échelle CSS : 12 px à l'écran, 20 px en scène 1920×1080. */
    fontSize: studio ? 20 : 12,
    text: cssVar('--text'),
    muted: cssVar('--muted'),
    grid: cssVar('--grid'),
    bg: cssVar('--surface'),
    series: [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4'), cssVar('--c5'), cssVar('--c6')],
    good: cssVar('--good'),
    warn: cssVar('--warn'),
    bad: cssVar('--bad'),
    /** Marques neutres des agrégats (grammaire du 23/09) : le sémaphore ne juge qu'un réseau. */
    mark: cssVar('--mark'),
    markHi: cssVar('--mark-hi'),
    fontFamily: cssVar('--font'),
  }
}

/** Gris « sans donnée » de repli, quand les jetons CSS ne sont pas chargés (tests hors navigateur). */
const NO_DATA_LIGHT = '#f3f5f8'
const NO_DATA_DARK = '#141b24'
/** Préférence système, quand le navigateur la fournit ; certains environnements de test l'annoncent sans l'implémenter. */
const darkMedia = (() => {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  } catch {
    return null
  }
})()

/** Fond sombre en cours : mode studio, ou thème sombre du système non forcé en clair. */
export function isDark(): boolean {
  const root = document.documentElement
  if (root.classList.contains('studio')) return true
  if (root.dataset.theme === 'light') return false
  return root.dataset.theme === 'dark' || Boolean(darkMedia?.matches)
}
/**
 * Rampe ardoise des parts agrégées (grammaire du 23/09) : cinq paliers lus dans les jetons --m1…--m5 de
 * styles.css, donc toujours ceux du thème affiché (clair → foncé, inversée en sombre).
 */
export function ardoise(): string[] {
  return ['--m1', '--m2', '--m3', '--m4', '--m5'].map(cssVar)
}
const enRvb = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : null)
/**
 * Rampe neutre de `n` paliers pour les cartes de statistiques (parts par département, taux, dénombrements,
 * indicateurs SISPEA) : la rampe ardoise, interpolée entre ses cinq jetons quand il faut plus de cinq paliers. Ce
 * qui juge ou alerte (situation d'une commune, avis, sécheresse) prend `couleursEtats`. Coûteuse (lecture des
 * jetons) : les échelles la mémorisent par thème (lib/scale.ts).
 */
export function neutre(n: number): string[] {
  const a = ardoise()
  if (n <= 1) return [a[2]]
  const rvb = a.map(enRvb)
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * (a.length - 1)
    const k = Math.min(Math.floor(t), a.length - 2)
    const [c0, c1] = [rvb[k], rvb[k + 1]]
    if (!c0 || !c1) return a[Math.round(t)]
    return '#' + c0.map((v, j) => Math.round(v + (c1[j] - v) * (t - k)).toString(16).padStart(2, '0')).join('')
  })
}
/**
 * Couleurs d'une suite d'états sur une carte ou un graphique (règle « juger et alerter en couleur » de l'auteur,
 * 24/09) : la palette de « Lire un bulletin ». Chaque état garde sa couleur ; l'état « bon » prend le vert clair
 * (--good-line), pour que les problèmes ressortent sur une carte presque entièrement conforme. Deux degrés successifs
 * d'une même couleur : le plus grave ressort davantage, et la clarté suit toujours la gravité — l'orange le moins
 * grave en teinte claire (vigilance avant alerte, 30 jours au plus avant plus de 30 jours), le rouge le plus grave
 * en --bad-fort (crise après alerte renforcée, restriction après ébullition). Un rouge clair pour le moins grave,
 * premier essai, passait pour moins grave que l'orange (revue du 24/09). `null` : état sans jugement (« aucun
 * avis »), gris neutre --d0.
 */
export function couleursEtats(tons: readonly ('good' | 'warn' | 'bad' | null)[]): string[] {
  return tons.map((t, i) => {
    if (t === null) return cssVar('--d0')
    if (t === 'good') return cssVar('--good-line')
    if (t === 'warn') return cssVar(tons[i + 1] === 'warn' ? '--warn-line' : '--warn')
    return cssVar(tons[i - 1] === 'bad' ? '--bad-fort' : '--bad')
  })
}
/**
 * Palette divergente neutre du thème courant, sept teintes, pour les évolutions dont le zéro a un sens et les
 * niveaux de nappes : ardoise froide (--m5, --m3, --m1), gris --d0 au centre, ocre grisé (--w1…--w3). Le rouge
 * « alarme » de l'ancienne palette (RdBu) présentait une hausse de prélèvements comme un jugement sanitaire.
 */
export function div(): string[] {
  return ['--m5', '--m3', '--m1', '--d0', '--w1', '--w2', '--w3'].map(cssVar)
}
/**
 * Couleur « sans donnée » du thème courant : la surface, hors de toute rampe. L'ancien gris (#bdbdbd) se
 * confondait avec le premier palier ardoise (#aeb7c4).
 */
export function noData(): string {
  return cssVar('--surface-2') || (isDark() ? NO_DATA_DARK : NO_DATA_LIGHT)
}

/**
 * Clé du thème affiché (« clair », « sombre », « studio »), lue sur la page elle-même : elle change dès que
 * `data-theme` ou la classe studio change, ou que le système bascule. Les options ECharts calculées dans des
 * `useMemo` y figurent en dépendance : sans elle, leurs couleurs (lues par `cssVar()` au calcul) restaient
 * celles du thème précédent jusqu'au rechargement.
 */
export function cleTheme(): string {
  if (document.documentElement.classList.contains('studio')) return 'studio'
  return isDark() ? 'sombre' : 'clair'
}
function abonnerTheme(avertir: () => void): () => void {
  const obs = new MutationObserver(avertir)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  darkMedia?.addEventListener?.('change', avertir)
  return () => {
    obs.disconnect()
    darkMedia?.removeEventListener?.('change', avertir)
  }
}
export function useCleTheme(): string {
  return useSyncExternalStore(abonnerTheme, cleTheme, () => 'clair')
}

const CLE_THEME = 'theme'
export type Theme = 'light' | 'dark'
function lireTheme(): Theme | null {
  try {
    const v = localStorage.getItem(CLE_THEME)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}
/**
 * Thème de la page : celui du système tant que le visiteur n'a rien choisi (décision de l'auteur du
 * 23/09, qui remplace le « clair par défaut » de la veille), puis le choix fait avec le bouton, mémorisé.
 * Sans choix, `data-theme` reste absent et la feuille de style suit `prefers-color-scheme` ; `index.html`
 * applique le choix mémorisé avant le premier affichage (pas d'éclair blanc). L'attribut est écrit dès le
 * clic, avant le nouveau rendu, pour que `cssVar()` lise déjà les couleurs du nouveau thème.
 * Renvoie le thème affiché (choisi ou système) et le moyen d'en choisir un.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [choix, setChoix] = useState<Theme | null>(() => lireTheme())
  const cle = useCleTheme()
  useEffect(() => {
    const root = document.documentElement
    if (choix) root.dataset.theme = choix
    else delete root.dataset.theme
  }, [choix])
  const choisir = (t: Theme) => {
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem(CLE_THEME, t)
    } catch {
      /* stockage indisponible : le choix ne survivra pas à la session */
    }
    setChoix(t)
  }
  return [choix ?? (cle === 'clair' ? 'light' : 'dark'), choisir]
}

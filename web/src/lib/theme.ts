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
    // Encres ardoise seulement : le violet --c5, reliquat de l'ancienne « consigne d'ébullition », est retiré (audit du 27/09).
    series: [cssVar('--c1'), cssVar('--c2'), cssVar('--c3'), cssVar('--c4'), cssVar('--c6')],
    /** Marques neutres du contexte (ressource, amont, services d'eau). */
    mark: cssVar('--mark'),
    markHi: cssVar('--mark-hi'),
    /** Marques des agrégats de la qualité de l'eau (04/10) : la rampe bleu → jaune → rouge. */
    alerte: cssVar('--q-mark'),
    alerteHi: cssVar('--q-mark-hi'),
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
  return interpoler(ardoise(), n)
}
/**
 * Rampe de la qualité de l'eau (choix de l'auteur du 04/10, « la palette couleur partout ») : parts de réseaux non
 * conformes, taux de prélèvements, avis et dénombrements, du bleu au jaune puis au rouge (ColorBrewer RdYlBu, 05/10), jetons --q1…--q5 ;. Le contexte (nappes, SISPEA, ressource) garde ses rampes neutres.
 */
export function qualite(): string[] {
  return ['--q1', '--q2', '--q3', '--q4', '--q5'].map(cssVar)
}
/**
 * Couleurs des notes A, B, C et D (jetons du sémaphore, paliers --q2 à --q5 de la rampe) : celles des cartes de parts
 * (auteur, 2026-10-07, « on ne comprend pas bien la transition entre graphique notation et carte ») — une carte placée
 * sous une barre de notes ou de situations parle avec les mêmes couleurs, du bleu clair au rouge.
 */
export function couleursNotes(): string[] {
  return ['--good-line', '--warn-line', '--warn', '--bad'].map(cssVar)
}
/** Rampe de la qualité de l'eau en `n` paliers, interpolée entre ses cinq jetons. */
export function alerte(n: number): string[] {
  return interpoler(qualite(), n)
}
/**
 * Rampe ocre des parts de nappes basses (audit du 27/09) : du gris --d0 (aucun piézomètre bas) à l'ocre --w3, le
 * côté « bas » de la divergente des classes de nappes (lib/nappes.couleursClasses). L'ardoise, qui y désigne le côté
 * « haut », disait l'inverse sur la carte voisine du graphique.
 */
export function ocre(n: number): string[] {
  return interpoler(['--d0', '--w1', '--w2', '--w3'].map(cssVar), n)
}
/** `n` teintes réparties sur une suite de jetons, interpolées entre jetons voisins. */
function interpoler(a: string[], n: number): string[] {
  if (n <= 1) return [a[Math.floor(a.length / 2)]]
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
 * 24/09) : la palette de « Lire un bulletin », celle de la carte depuis le 07/10 (paliers --q2 à --q5 de la rampe
 * RdYlBu). Chaque état garde sa couleur ; l'état « bon » prend le bleu clair (--good-line). Deux degrés successifs :
 * le moins grave de deux « warn » en jaune (--warn-line : vigilance avant alerte, 30 jours au plus avant plus de 30
 * jours), le plus grave de deux « bad » en --bad-fort, rouge très sombre qui prolonge la rampe (crise après alerte
 * renforcée, restriction après ébullition). `null` : état sans jugement (« aucun avis »), gris neutre --d0.
 */
export function couleursEtats(tons: readonly ('good' | 'warn' | 'bad' | null)[]): string[] {
  return jetonsEtats(tons).map(cssVar)
}
/** Jetons de couleur d'une suite d'états (règle de `couleursEtats`), pour un style CSS qui suit le thème de lui-même. */
export function jetonsEtats(tons: readonly ('good' | 'warn' | 'bad' | null)[]): string[] {
  return tons.map((t, i) => {
    if (t === null) return '--d0'
    if (t === 'good') return '--good-line'
    if (t === 'warn') return tons[i + 1] === 'warn' ? '--warn-line' : '--warn'
    return tons[i - 1] === 'bad' ? '--bad-fort' : '--bad'
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

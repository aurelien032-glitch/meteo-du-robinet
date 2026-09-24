// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { div, neutre, noData } from './theme'
import { serieMedianes } from './sispea'
import { etiquetterExtremes } from '../components/Chart'
import type { SispeaNationalFile } from './types'

/** Clarté OKLab (0 noir, 1 blanc) d'une couleur hexadécimale. */
function clarte(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
}

// Jetons des cartes de styles.css (jsdom ne charge pas la feuille ; lib/jetons.test.ts vérifie qu'ils y sont).
const JETONS = {
  clair: { '--m1': '#aeb7c4', '--m2': '#8c97a8', '--m3': '#6c788c', '--m4': '#4e5a6f', '--m5': '#313c52', '--surface-2': '#f3f5f8', '--d0': '#d6d9dd', '--w1': '#d4bc9c', '--w2': '#a5845e', '--w3': '#6f5236' },
  sombre: { '--m1': '#4a5568', '--m2': '#66728a', '--m3': '#8792a7', '--m4': '#a9b4c5', '--m5': '#d0d8e3', '--surface-2': '#141b24', '--d0': '#2b2f35', '--w1': '#604b36', '--w2': '#ac8a62', '--w3': '#e5c79f' },
}
const poser = (t: keyof typeof JETONS) => Object.entries(JETONS[t]).forEach(([k, v]) => document.documentElement.style.setProperty(k, v))

describe('rampe neutre des cartes (règle « neutre partout », 24/09)', () => {
  it("fonce à chaque palier sur fond clair, même interpolée au-delà des cinq jetons : l'ordre se lit sans la teinte", () => {
    poser('clair')
    for (const n of [3, 4, 5, 7, 8]) {
      const L = neutre(n).map(clarte)
      L.slice(1).forEach((v, i) => expect(L[i] - v).toBeGreaterThan(0.04))
    }
  })
  it("s'éclaircit à chaque palier sur fond sombre", () => {
    poser('sombre')
    const L = neutre(8).map(clarte)
    L.slice(1).forEach((v, i) => expect(v - L[i]).toBeGreaterThan(0.04))
  })
  it('garde « sans donnée » hors de la rampe : la surface, loin du premier palier', () => {
    for (const t of ['clair', 'sombre'] as const) {
      poser(t)
      expect(Math.abs(clarte(noData()) - clarte(neutre(5)[0]))).toBeGreaterThan(0.1)
    }
  })
  it('divergente : la clarté s’éloigne du centre à chaque palier, des deux côtés, dans les deux thèmes', () => {
    for (const t of ['clair', 'sombre'] as const) {
      poser(t)
      const L = div().map(clarte)
      const ecart = (i: number) => Math.abs(L[i] - L[3])
      ;[2, 1, 0].forEach((i) => expect(ecart(i)).toBeGreaterThan(ecart(i + 1)))
      ;[4, 5, 6].forEach((i) => expect(ecart(i)).toBeGreaterThan(ecart(i - 1)))
    }
  })
})

describe('serieMedianes', () => {
  const q = (p50: number, n: number) => ({ p50, p10: null, p90: null, n })
  const nat = {
    serie_api: { '2008': { 'D102.0': q(1.8, 1776) }, '2009': { 'D102.0': q(1.9, 5000) } },
    annees: { '2020': { prix: q(2.1, 6000), rend: q(80, 6000) }, '2025': { prix: q(9, 900), rend: q(1, 900) }, '2026': { prix: q(9, 0), rend: q(1, 0) } },
  } as unknown as SispeaNationalFile
  it('laisse un trou sous le seuil de déclarants et retire les années de bord vides', () => {
    const s = serieMedianes(nat)
    expect(s.years).toEqual(['2009', '2020'])
    expect(s.prix).toEqual([1.9, 2.1])
    expect(s.rend).toEqual([null, 80])
  })
})

describe('etiquetterExtremes', () => {
  it("n'étiquette que les points les plus hauts sur chaque axe", () => {
    const pts = [
      { value: [1, 9] },
      { value: [9, 1] },
      { value: [5, 5] },
      { value: [2, 2] },
    ]
    const out = etiquetterExtremes(pts, 1)
    expect(out.map((p) => Boolean(p.label?.show))).toEqual([true, true, false, false])
  })
})

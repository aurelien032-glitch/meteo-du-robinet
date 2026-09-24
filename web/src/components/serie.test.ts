// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { MoisSerie } from '../lib/serie'
import SerieMensuelle from './SerieMensuelle'

// React 19 : act() sans bibliothèque de test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ASSELINERIE, somme des 20 PFAS en 2025 (series/dept/50.json) : pas d'analyse en janvier, dépassements de février à septembre.
const MAX = [null, 0.261, 0.459, 0.351, 0.316, 0.261, 0.227, 0.222, 0.256, 0.004, 0.004, 0.003]
const N = [0, 1, 2, 2, 2, 2, 2, 2, 6, 12, 8, 3]
const ND = [0, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0]
const SERIE: MoisSerie[] = MAX.map((max, i) => ({ mois: `2025-${String(i + 1).padStart(2, '0')}`, max, analyses: N[i], depassements: ND[i] }))
const ESPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
const texte = (el: Element | null) => (el?.textContent ?? '').replace(ESPACES, ' ')

let racine: Root | null = null
function rendre(juge = true): HTMLElement {
  const hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() => racine!.render(createElement(SerieMensuelle, { titre: 'Somme 20 PFAS, 2025', serie: SERIE, annee: '2025', unite: 'µg/L', limite: 0.1, juge })))
  return hote
}
afterEach(() => {
  act(() => racine?.unmount())
  racine = null
  document.body.innerHTML = ''
})

describe('SerieMensuelle', () => {
  it('douze mois : une barre par mois analysé, « – » sinon, les dépassements marqués, la limite écrite', () => {
    const el = rendre()
    const mois = [...el.querySelectorAll('.serie-mois')]
    expect(mois).toHaveLength(12)
    expect(mois.map((g) => (g.querySelector('.serie-barre') ? 'barre' : texte(g.querySelector('.serie-vide'))))).toEqual(['–', ...Array(11).fill('barre')])
    expect(el.querySelectorAll('.serie-barre.au-dessus')).toHaveLength(8)
    expect(texte(el.querySelector('.serie-limite-lab'))).toBe('limite de qualité 0,1 µg/L')
    expect(texte(mois[2].querySelector('title'))).toBe('mars 2025 : 0,459 µg/L au plus, 2 analyses, dont 2 au-dessus de la limite')
    expect(texte(mois[0].querySelector('title'))).toBe('janvier 2025 : aucune analyse')
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('un tableau pour les lecteurs d’écran, masqué dans un div (le tableau lui-même ne borne pas sa largeur)', () => {
    const el = rendre()
    const table = el.querySelector('.sr-only > table')!
    expect(texte(table.querySelector('caption'))).toBe('Somme 20 PFAS, 2025')
    const lignes = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => texte(c)))
    expect(lignes[0]).toEqual(['janvier', 'aucune analyse', '0', '0 analyse'])
    expect(lignes[2]).toEqual(['mars', '0,459 µg/L', '2', '2 analyses'])
  })

  it('plusieurs réseaux réunis : neutre, sans sémaphore', () => {
    expect(rendre(false).querySelector('.serie')?.classList.contains('serie--neutre')).toBe(true)
  })
})

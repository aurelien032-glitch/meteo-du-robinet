// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { instrument, valeursReseau, type Paliers as EchellePaliers, type Reglette } from '../lib/instruments'
import type { MetaFile } from '../lib/types'
import { anneesFiche } from '../lib/year'
import BarreAnnee from './BarreAnnee'
import Jauge from './Jauge'
import Paliers from './Paliers'
import Tag from './Tag'

// React 19 : act() sans bibliothèque de test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NB = String.fromCharCode(0xa0)
const SANS_VALEUR = valeursReseau(undefined, {})
let racine: Root | null = null

function rendre(el: ReactElement): HTMLElement {
  const hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() => racine!.render(el))
  return hote
}
afterEach(() => {
  act(() => racine?.unmount())
  racine = null
  document.body.innerHTML = ''
})

describe('BarreAnnee', () => {
  it('boutons à bascule : l’année choisie enfoncée, « en cours » et « sans données » écrits, le clic choisit', () => {
    const meta: MetaFile = { annees: [2023, 2024, 2025, 2026], partiel: [2026], construit_le: '2026-09-18', themes: [] }
    const choisir = vi.fn()
    const el = rendre(
      createElement(BarreAnnee, { titre: 'Bilan de l’année', note: 'Le bulletin suit l’année choisie.', annees: anneesFiche(meta, ['2024', '2025']), annee: 2025, onChange: choisir }),
    )
    const boutons = [...el.querySelectorAll('button')]
    expect(boutons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
    expect(boutons.map((b) => b.textContent)).toEqual(['2023 sans données', '2024', '2025', '2026 en cours sans données'])
    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Année')
    act(() => boutons[1].click())
    expect(choisir).toHaveBeenCalledWith(2024)
  })
})

describe('Jauge', () => {
  it('place la valeur à sa position, la lit au-dessus, la limite à l’encre', () => {
    const i = instrument('azote', 2, { ...SANS_VALEUR, nitratesMax: 45.9 })
    const el = rendre(createElement(Jauge, { reglette: i.echelle as Reglette, ton: i.ton, nom: 'Nitrates', libelle: i.libelle }))
    const marque = el.querySelector<HTMLElement>('.j-marque')!
    expect(parseFloat(marque.style.left)).toBeCloseTo(76.5, 6)
    expect(marque.classList.contains('tone-good')).toBe(true)
    expect(el.querySelector('.j-lecture')?.textContent).toBe(`45,9${NB}mg/L`)
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(`Nitrates : 45,9${NB}mg/L, maximum de 40 à 50 mg/L`)
    expect([...el.querySelectorAll('.j-grad')].map((g) => g.textContent)).toEqual(['0', '25', '40', '50', '60'])
    expect(el.querySelector('.j-grad.limite')?.textContent).toBe('50')
    expect(el.querySelectorAll('.j-repere')).toHaveLength(3)
    expect(el.querySelectorAll('.j-repere--limite')).toHaveLength(1)
  })

  it('sans valeur : l’échelle nue, décrite en clair', () => {
    const i = instrument('microbio', null, SANS_VALEUR)
    const el = rendre(createElement(Jauge, { reglette: i.echelle as Reglette, ton: null, nom: 'Bactériologie' }))
    expect(el.querySelector('.j-marque')).toBeNull()
    expect(el.querySelector('.jauge--nue')).not.toBeNull()
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(`Bactériologie : échelle de 90${NB}% à 100${NB}%, seuil 95${NB}%`)
  })
})

describe('Paliers', () => {
  it('pesticides : la classe atteinte pleine dans son ton, les classes non conformes teintées', () => {
    const e = instrument('pesticides', 2, SANS_VALEUR).echelle as EchellePaliers
    const el = rendre(createElement(Paliers, { classes: e.classes, actif: 2, nom: 'Pesticides et métabolites' }))
    expect([...el.querySelectorAll('.p-palier')].map((c) => c.className)).toEqual([
      'p-palier',
      'p-palier p-palier--warn',
      'p-palier p-palier--warn actif tone-warn',
      'p-palier p-palier--bad',
    ])
    expect(el.querySelector('.p-libelles .actif')?.textContent).toBe('Plus de 30 jours')
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Pesticides et métabolites : Plus de 30 jours')
  })

  it('échelle longue et grise : extrémités dessous, classe atteinte lue au-dessus, à l’encre', () => {
    const nappes = ['Très bas', 'Bas', 'Modérément bas', 'Autour de la normale', 'Modérément haut', 'Haut', 'Très haut'].map((t) => ({ t }))
    const el = rendre(createElement(Paliers, { classes: nappes, actif: 1, nom: 'Nappe la plus proche' }))
    expect(el.querySelector('.paliers--compact')).not.toBeNull()
    expect([...el.querySelectorAll('.p-bouts span')].map((s) => s.textContent)).toEqual(['Très bas', 'Très haut'])
    expect(el.querySelector('.p-lecture')?.textContent).toBe('Bas')
    expect(el.querySelector('.p-palier.actif')?.classList.contains('tone-neutre')).toBe(true)
    expect(el.querySelectorAll('.p-palier--warn, .p-palier--bad')).toHaveLength(0)
  })
})

describe('Tag', () => {
  it('voyant et libellé dans le ton ; sans ton, étiquette neutre sans voyant', () => {
    const el = rendre(
      createElement('div', null, createElement(Tag, { ton: 'bad', children: 'restriction de consommation' }), createElement(Tag, { ton: null, children: "limité à un bâtiment" })),
    )
    const [grave, neutre] = [...el.querySelectorAll('.tag')]
    expect(grave.className).toBe('tag tone-bad')
    expect(grave.querySelector('svg.voyant.tone-bad[aria-hidden="true"]')).not.toBeNull()
    expect(grave.textContent).toBe('restriction de consommation')
    expect(neutre.className).toBe('tag tone-neutre')
    expect(neutre.querySelector('svg')).toBeNull()
  })
})

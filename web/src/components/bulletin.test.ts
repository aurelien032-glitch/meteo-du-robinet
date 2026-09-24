// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { GroupeAvis } from '../lib/avis'
import type { ReseauBulletin } from '../lib/bulletin'
import type { CommuneYearStats, Famille, ParamInfo } from '../lib/types'
import Bulletin from './Bulletin'

// React 19 : act() sans bibliothèque de test.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const p = (l: string, u: string, lim: string, f: Famille): ParamInfo => ({ l, u, lim, ref: null, f, n: 0, nd: 0, nr: 0, nq: 0, a: [], k: null })
const PARAMS: Record<string, ParamInfo> = {
  '1340': p('Nitrates (en NO3)', 'mg/L', '<=50 mg/L', 'azote'),
  '8847': p('Somme de 20 substances perfluoroalkylées (PFAS)', 'µg/L', '<=0,1 µg/L', 'pfas'),
}
// Cherbourg-en-Cotentin en 2025 : codes réels, statistiques réelles d'ASSELINERIE réduites aux champs lus.
const r = (code: string, nom: string, situation: string | null): ReseauBulletin => ({ code, nom, situation })
const CHERBOURG = [
  r('050000558', 'HAMEAU MESNAGE', '01000'),
  r('050000639', 'DIVETTE', '00001'),
  r('050000640', 'TOURLAVILLE EST', '00000'),
  r('050000641', 'TOURLAVILLE OUEST', '00000'),
  r('050000642', 'TRAISNELLERIE', '00000'),
  r('050000644', 'BENECERE', '00000'),
  r('050000645', 'ASSELINERIE', '01200'),
]
const ASSELINERIE: CommuneYearStats = {
  plv: [63, 0, 13, 15, 63, 0, 0],
  fam: {},
  cle: { '1340': [13, 0, 0, 13, 27.3, 14.331, 12.3, '2025-12-17'], '8847': [42, 15, 0, 26, 0.459, 0.092, 0.003, '2025-12-29'] },
  dep: [['8847', 42, 15, 0, 26, 0.459, 0.092, 0.003, '2025-12-29']],
}
const AVIS: GroupeAvis[] = [
  { id: 1, texte: 'Eau non conforme pour les PFAS : restriction de consommation.', cat: 'interdiction', local: false, causes: ['PFAS'], debut: '2025-09-16', fin: '2025-09-16', n: 1, reseaux: ['050000645'] },
]
const ESPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
const texte = (el: Element | null) => (el?.textContent ?? '').replace(ESPACES, ' ')

let racine: Root | null = null
function rendre(reseaux: ReseauBulletin[], avis: GroupeAvis[] = [], sansInfo: { conclusions: number; lieux: string } | null = null): HTMLElement {
  const hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  const bulletin = createElement(Bulletin, {
    question: 'Puis-je boire l’eau du robinet ?',
    annee: '2025',
    reseaux,
    stats: (code: string) => (code === '050000645' ? ASSELINERIE : undefined),
    params: PARAMS,
    avis,
    sansInfo,
    comptes: { prelevements: 268, analyses: 17688, depassements: 18 },
  })
  act(() => racine!.render(createElement(MemoryRouter, null, bulletin)))
  return hote
}
afterEach(() => {
  act(() => racine?.unmount())
  racine = null
  document.body.innerHTML = ''
})
const touche = (el: Element, key: string) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))

describe('Bulletin', () => {
  it('verdict, phrase d’appui et voyant de l’ensemble des réseaux', () => {
    const el = rendre(CHERBOURG)
    expect(texte(el.querySelector('.b-verdict'))).toBe('Restriction ou consigne de consommation en 2025')
    expect(texte(el.querySelector('.b-head p + p'))).toContain('2 des 7 réseaux qui desservent la commune sont concernés')
    expect(el.querySelector('.b-head svg')?.getAttribute('class')).toContain('tone-bad')
  })

  it('onglets : le plus défavorable d’office, puis les flèches, début et fin, comme le motif ARIA', () => {
    const el = rendre(CHERBOURG)
    const onglets = () => [...el.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    const choisi = () => onglets().find((t) => t.getAttribute('aria-selected') === 'true')!
    expect(onglets().map((t) => texte(t.querySelector('span')))).toEqual(['ASSELINERIE', 'DIVETTE', 'BENECERE', 'HAMEAU MESNAGE', 'TOURLAVILLE EST', 'TOURLAVILLE OUEST', 'TRAISNELLERIE'])
    expect(onglets().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1])
    expect(texte(choisi())).toContain('— restriction ou consigne')
    const panneau = el.querySelector('[role="tabpanel"]')!
    expect(panneau.getAttribute('aria-labelledby')).toBe(choisi().id)

    touche(choisi(), 'ArrowRight')
    expect(texte(choisi().querySelector('span'))).toBe('DIVETTE')
    expect(document.activeElement).toBe(choisi())
    expect(texte(el.querySelector('.rpick-now'))).toBe('Instruments du réseau DIVETTE')
    touche(choisi(), 'End')
    expect(texte(choisi().querySelector('span'))).toBe('TRAISNELLERIE')
    touche(choisi(), 'ArrowRight')
    expect(texte(choisi().querySelector('span'))).toBe('ASSELINERIE')
    touche(choisi(), 'ArrowLeft')
    expect(texte(choisi().querySelector('span'))).toBe('TRAISNELLERIE')
    touche(choisi(), 'Home')
    expect(texte(choisi().querySelector('span'))).toBe('ASSELINERIE')
    act(() => onglets()[3].click())
    expect(texte(choisi().querySelector('span'))).toBe('HAMEAU MESNAGE')
    expect(panneau.getAttribute('aria-labelledby')).toBe(choisi().id)
  })

  it('cinq familles du réseau affiché, avec ce qui est en cause', () => {
    const el = rendre(CHERBOURG)
    const lignes = [...el.querySelectorAll('.fam')]
    expect(lignes.map((l) => texte(l.querySelector('.fam-name')))).toEqual(['Pesticides et métabolites', 'Nitrates', 'PFAS', 'Bactériologie', 'Métaux et minéraux'])
    expect(texte(lignes[2].querySelector('.fam-status'))).toBe('restriction de consommation — restriction ou consigne')
    expect(texte(lignes[2].querySelector('.fam-cause'))).toBe('Somme de 20 substances perfluoroalkylées (PFAS) : 15 analyses sur 42 au-dessus de la limite, au plus 0,459 µg/L.')
    expect(texte(lignes[1].querySelector('.fam-status'))).toBe('maximum de 25 à 40 mg/L — conforme')
  })

  it('avis de l’année, réseau nommé quand il y en a plusieurs ; comptes de l’ensemble', () => {
    const el = rendre(CHERBOURG, AVIS)
    const avis = el.querySelector('.b-avis-liste li')!
    expect(texte(avis.querySelector('.tag'))).toBe('Restriction de consommation')
    expect(texte(avis.querySelector('.cap'))).toBe('Le 16/09/2025 · 1 prélèvement · PFAS · réseau ASSELINERIE')
    expect(texte(avis.querySelector('blockquote'))).toBe('Eau non conforme pour les PFAS : restriction de consommation.')
    expect(texte(el.querySelector('.counts'))).toBe('268 prélèvements · 17 688 analyses · 18 au-dessus d’une limite (les 7 réseaux)')
  })

  it('un seul réseau : ni onglets ni rappel du réseau affiché ; sans avis, une phrase', () => {
    const el = rendre([r('050000645', 'ASSELINERIE', '01200')])
    expect(el.querySelector('[role="tablist"]')).toBeNull()
    expect(el.querySelector('.rpick-now')).toBeNull()
    expect(el.querySelector('.fams')?.getAttribute('role')).toBeNull()
    expect(texte(el.querySelector('.b-avis .muted'))).toBe('Aucun avis : ni restriction, ni consigne d’ébullition, ni recommandation pour les publics sensibles.')
    expect(texte(el.querySelector('.counts'))).not.toContain('réseaux)')
  })

  it('délégation sans information : « pas d’information », jamais « aucun avis » ; un avis présent l’emporte', () => {
    const isere = { conclusions: 8234, lieux: 'de l’Isère' }
    const el = rendre([r('038000123', 'VIZILLE', '00000')], [], isere)
    expect(el.querySelector('.b-avis .muted')).toBeNull()
    expect(texte(el.querySelector('.b-sans-info'))).toBe(
      'Pas d’information sur les consignes. En 2025, aucune des 8 234 conclusions de l’ARS sur les réseaux de l’Isère n’évoque de consigne, ni pour en prescrire une, ni pour l’écarter : l’absence d’avis ne dit donc rien ici. La mairie et l’ARS font foi.',
    )
    act(() => racine?.unmount())
    racine = null
    const avecAvis = rendre(CHERBOURG, AVIS, isere)
    expect(avecAvis.querySelector('.b-sans-info')).toBeNull()
    expect(avecAvis.querySelectorAll('.b-avis-liste li')).toHaveLength(1)
  })
})

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { binaryScale, linearScale, stepScale } from './scale'
import { couleursSituation } from './situations'
import { couleursEtats, neutre, noData } from './theme'
import { TONS_SECHERESSE } from './vigieau'

// jsdom ne charge pas styles.css : les jetons des cartes sont posés sur la racine, comme chaque thème les donne.
const RAMPE = ['#aeb7c4', '#8c97a8', '#6c788c', '#4e5a6f', '#313c52']
const JETONS = {
  clair: { '--m1': RAMPE[0], '--m2': RAMPE[1], '--m3': RAMPE[2], '--m4': RAMPE[3], '--m5': RAMPE[4], '--surface-2': '#f3f5f8', '--d0': '#d6d9dd', '--w1': '#d4bc9c', '--w2': '#a5845e', '--w3': '#6f5236', '--good-line': '#b3dbc3', '--warn-line': '#efcb8a', '--warn': '#d08400', '--bad-line': '#edb3ad', '--bad': '#a11a12', '--bad-fort': '#6b100c' },
  sombre: { '--m1': '#4a5568', '--m2': '#66728a', '--m3': '#8792a7', '--m4': '#a9b4c5', '--m5': '#d0d8e3', '--surface-2': '#141b24', '--d0': '#2b2f35', '--w1': '#604b36', '--w2': '#ac8a62', '--w3': '#e5c79f', '--good-line': '#25613f', '--warn-line': '#7a5a1c', '--warn': '#e0a030', '--bad-line': '#813028', '--bad': '#f0584c', '--bad-fort': '#ff9d92' },
}
function theme(t: 'clair' | 'sombre') {
  const root = document.documentElement
  root.className = t === 'sombre' ? 'studio' : ''
  root.dataset.theme = t === 'sombre' ? 'dark' : 'light'
  for (const [k, v] of Object.entries(JETONS[t])) root.style.setProperty(k, v)
}

beforeEach(() => theme('clair'))

describe('échelles de carte', () => {
  it('donne à chaque valeur la couleur du palier annoncé par la légende', () => {
    const s = linearScale(0, 70)
    // Toute valeur d'un palier reçoit la couleur de ce palier : la légende est donc exacte.
    for (let i = 0; i < s.steps.length; i++) {
      const { from, color } = s.steps[i]
      const to = i + 1 < s.steps.length ? s.steps[i + 1].from : 70
      expect(s.color(from)).toBe(color)
      expect(s.color((from + to) / 2)).toBe(color)
    }
    expect(s.steps).toHaveLength(7)
    expect(s.color(70)).toBe(s.steps[6].color)
    expect(s.color(1000)).toBe(s.steps[6].color)
    expect(s.color(-5)).toBe(s.steps[0].color)
    expect(s.color(null)).toBe(noData())
  })

  it('peint les statistiques sur la rampe neutre, du premier au dernier jeton ardoise (règle du 24/09)', () => {
    const s = stepScale([0, 1, 5, 10, 25, 50, 100])
    expect(s.steps.map((x) => x.color)).toEqual(neutre(7))
    expect(s.steps[0].color).toBe(RAMPE[0])
    expect(s.steps[6].color).toBe(RAMPE[4])
  })

  it('inverse les couleurs quand une valeur haute est une bonne nouvelle, sans inverser la légende', () => {
    const s = linearScale(0, 100, { invert: true })
    expect(s.steps[0].from).toBe(0) // la légende reste croissante
    expect(s.steps[0].color).toBe(RAMPE[4]) // mais la couleur forte est du côté des valeurs basses
    expect(s.color(0)).toBe(RAMPE[4])
    expect(s.color(99)).toBe(RAMPE[0])
  })

  it("n'annonce qu'un seul palier quand toutes les valeurs sont égales", () => {
    const s = linearScale(5, 5)
    expect(s.steps).toHaveLength(1)
    expect(s.color(5)).toBe(s.steps[0].color)
    expect(s.color(0)).toBe(s.steps[0].color)
  })

  it('fusionne les bornes répétées quand la mesure est un dénombrement', () => {
    const s = linearScale(0, 1, { entier: true })
    expect(s.steps.map((x) => x.from)).toEqual([0, 1]) // deux paliers, pas sept « 0–0 »
    expect(s.color(0)).toBe(s.steps[0].color)
    expect(s.color(1)).toBe(s.steps[1].color)
    expect(linearScale(0, 3, { entier: true }).steps.map((x) => x.from)).toEqual([0, 1, 2, 3])
  })

  it('signale une échelle relative et pas une échelle à bornes fixes', () => {
    expect(linearScale(0, 1).relative).toBe(true)
    expect(stepScale([0, 0.5]).relative).toBe(false)
    expect(binaryScale().relative).toBe(false)
  })

  it('range une valeur dans le palier fixe qui la contient', () => {
    const s = stepScale([0, 0.05, 0.1, 0.2])
    expect(s.color(0)).toBe(s.steps[0].color)
    expect(s.color(0.049)).toBe(s.steps[0].color)
    expect(s.color(0.05)).toBe(s.steps[1].color)
    expect(s.color(0.9)).toBe(s.steps[3].color)
  })

  it('utilise les deux extrémités de la rampe pour une échelle binaire', () => {
    const s = binaryScale()
    expect(s.color(0)).toBe(RAMPE[0])
    expect(s.color(1)).toBe(RAMPE[4])
  })

  it('suit le thème même si le thème change après la construction de l’échelle', () => {
    // Le mode studio s'active après le premier rendu : une échelle construite en clair doit se
    // recolorer, sinon la carte reste pâle sur fond sombre.
    const s = linearScale(0, 10)
    const clairColor = s.color(5)
    const clairSwatch = s.steps[0].color
    theme('sombre')
    expect(s.color(5)).not.toBe(clairColor)
    expect(s.steps[0].color).not.toBe(clairSwatch)
    expect(s.steps[0].color).toBe('#4a5568')
    expect(s.color(null)).toBe('#141b24')
  })
})

describe('niveauxScale', () => {
  it('donne une couleur et un palier de légende par niveau', async () => {
    const { niveauxScale } = await import('./scale')
    const s = niveauxScale(() => ['#a', '#b', '#c', '#d'])
    expect(s.steps.map((x) => x.from)).toEqual([0, 1, 2, 3])
    expect(s.color(3)).toBe('#d')
    expect(s.color(1)).toBe('#b')
    expect(s.color(null)).toBe(noData())
    expect(s.color(9)).toBe(noData()) // niveau inconnu : « sans donnée », jamais une couleur de gravité au hasard
  })
  it('avis de l’ARS sur la carte : la palette de « Lire un bulletin », comme leurs étiquettes', async () => {
    const { avisScale } = await import('./scale')
    // aucun avis gris, publics sensibles orange, ébullition rouge, restriction rouge fort (le plus grave des deux)
    expect(avisScale.steps.map((x) => x.color)).toEqual(['#d6d9dd', '#d08400', '#a11a12', '#6b100c'])
  })
})

describe('niceScale et divergingScale (revue du 2026-09-22)', () => {
  it('arrondit les bornes à un pas rond', async () => {
    const { niceScale, pasRond } = await import('./scale')
    expect(pasRond(46.8)).toBe(50)
    expect(pasRond(0.31)).toBe(0.5)
    expect(niceScale(0, 2300).steps.map((x) => x.from)).toEqual([0, 500, 1000, 1500, 2000])
    expect(niceScale(0, 3, { entier: true }).steps.map((x) => x.from)).toEqual([0, 1, 2])
  })
  it('ouvre le premier palier divergent vers le bas', async () => {
    const { divergingScale } = await import('./scale')
    const s = divergingScale([-10, -5, -1, 1, 5, 10, 20])
    expect(s.ouvertBas).toBe(true)
    expect(s.color(-25)).toBe(s.color(-10))
    expect(s.color(0)).not.toBe(s.color(7))
    // neutre : ardoise du côté baisse, gris au centre, ocre grisé du côté hausse
    expect(s.steps.map((x) => x.color)).toEqual([RAMPE[4], RAMPE[2], RAMPE[0], '#d6d9dd', '#d4bc9c', '#a5845e', '#6f5236'])
  })
})

describe('ardoiseScale (grammaire du 23/09)', () => {
  it('cinq paliers fixes lus dans --m1…--m5, chaque part dans son palier, le premier ouvert vers le bas', async () => {
    const { ardoiseScale } = await import('./scale')
    const s = ardoiseScale()
    expect(s.steps).toEqual(RAMPE.map((color, i) => ({ color, from: [0, 0.05, 0.1, 0.2, 0.4][i] })))
    expect([0, 0.049, 0.05, 0.1, 0.1999, 0.2, 0.4, 0.75].map(s.color)).toEqual([RAMPE[0], RAMPE[0], RAMPE[1], RAMPE[2], RAMPE[2], RAMPE[3], RAMPE[4], RAMPE[4]])
    // sans donnée : la surface, hors de la rampe (l'ancien gris #bdbdbd se confondait avec le premier palier)
    expect(s.color(null)).toBe('#f3f5f8')
    expect(s.color(null)).toBe(noData())
    expect([s.relative, s.ouvertBas]).toEqual([false, true])
  })
  it('facteur 100 : mêmes paliers pour des parts écrites en pourcentage (page Amont)', async () => {
    const { ardoiseScale } = await import('./scale')
    const s = ardoiseScale(100)
    expect(s.steps.map((x) => x.from)).toEqual([0, 5, 10, 20, 40])
    expect([4.9, 5, 39.9, 40].map(s.color)).toEqual([RAMPE[0], RAMPE[1], RAMPE[3], RAMPE[4]])
  })
  it('suit le thème : les jetons sont relus quand le thème change', async () => {
    const { ardoiseScale } = await import('./scale')
    const s = ardoiseScale()
    expect(s.color(0.5)).toBe(RAMPE[4])
    theme('sombre')
    expect(s.color(0.5)).toBe('#d0d8e3')
    expect(s.steps[4].color).toBe('#d0d8e3')
  })
})

describe('couleurs des états (règle « juger et alerter en couleur », 24/09)', () => {
  it('garde la couleur de chaque état, vert clair pour « bon », le plus grave de deux degrés ressort davantage', () => {
    expect(couleursEtats(['good', 'warn', 'warn', 'bad'])).toEqual(['#b3dbc3', '#efcb8a', '#d08400', '#a11a12'])
    expect(couleursEtats([null, 'warn', 'bad', 'bad'])).toEqual(['#d6d9dd', '#d08400', '#a11a12', '#6b100c'])
  })
  it('carte communale : le ton de chaque classe, jamais son rang', () => {
    // pesticides : conforme, 30 jours au plus, plus de 30 jours, restriction
    expect(couleursSituation('pesticides')).toEqual(['#b3dbc3', '#efcb8a', '#d08400', '#a11a12'])
    // nitrates : trois classes conformes (réserves comprises), puis non conforme au-delà de 50 mg/L
    expect(couleursSituation('azote')).toEqual(['#b3dbc3', '#b3dbc3', '#b3dbc3', '#d08400'])
    expect(couleursSituation('toutes')).toEqual(['#b3dbc3', '#d08400', '#a11a12'])
  })
  it('sécheresse : pas de restriction, vigilance, alerte, alerte renforcée, crise', () => {
    // la clarté suit la gravité : un rouge clair pour l'alerte renforcée passait pour moins grave que l'alerte orange
    expect(couleursEtats(TONS_SECHERESSE)).toEqual(['#b3dbc3', '#efcb8a', '#d08400', '#a11a12', '#6b100c'])
  })
  it('suit le thème : en sombre, le plus grave est le plus clair', () => {
    theme('sombre')
    expect(couleursEtats(TONS_SECHERESSE)).toEqual(['#25613f', '#7a5a1c', '#e0a030', '#f0584c', '#ff9d92'])
  })
})

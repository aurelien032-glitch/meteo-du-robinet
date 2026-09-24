// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { binaryScale, linearScale, stepScale } from './scale'
import { neutre, noData } from './theme'

// jsdom ne charge pas styles.css : les jetons des cartes sont posés sur la racine, comme chaque thème les donne.
const RAMPE = ['#aeb7c4', '#8c97a8', '#6c788c', '#4e5a6f', '#313c52']
const JETONS = {
  clair: { '--m1': RAMPE[0], '--m2': RAMPE[1], '--m3': RAMPE[2], '--m4': RAMPE[3], '--m5': RAMPE[4], '--surface-2': '#f3f5f8', '--d0': '#d6d9dd', '--w1': '#d4bc9c', '--w2': '#a5845e', '--w3': '#6f5236' },
  sombre: { '--m1': '#4a5568', '--m2': '#66728a', '--m3': '#8792a7', '--m4': '#a9b4c5', '--m5': '#d0d8e3', '--surface-2': '#141b24', '--d0': '#2b2f35', '--w1': '#604b36', '--w2': '#ac8a62', '--w3': '#e5c79f' },
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

  it('peint toutes les cartes sur la rampe neutre, du premier au dernier jeton ardoise (règle « neutre partout », 24/09)', () => {
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
  it('avis de l’ARS sur la carte : quatre niveaux neutres, du plus clair (aucun avis) au plus foncé (restriction)', async () => {
    const { avisScale } = await import('./scale')
    expect(avisScale.steps.map((x) => x.color)).toEqual(neutre(4))
    expect(avisScale.color(0)).toBe(RAMPE[0])
    expect(avisScale.color(3)).toBe(RAMPE[4])
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

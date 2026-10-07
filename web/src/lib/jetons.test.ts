import { describe, expect, it } from 'vitest'
import brut from '../styles.css?raw'

// Fins de ligne ramenées à LF : sous Windows, git (core.autocrlf) extrait la feuille en CRLF, et les en-têtes de
// blocs sur deux lignes cherchés plus bas n'y étaient plus trouvés.
const css = brut.replace(/\r\n/g, '\n')

/**
 * Garde-fous des jetons de couleur (charte « Vigilance + instruments », 23/09) : les deux blocs sombres
 * restent identiques et complets, les contrastes tiennent dans les deux thèmes, la rampe ardoise des cartes
 * reste monotone. Le studio a déjà perdu des jetons une fois (commentaire d'audit du 23/09) : on le vérifie.
 */

/** Propriétés personnalisées déclarées dans le premier bloc qui suit exactement `entete {`. */
function bloc(entete: string): Record<string, string> {
  const i = css.indexOf(entete + ' {')
  expect(i, `bloc « ${entete} » introuvable`).toBeGreaterThanOrEqual(0)
  const corps = css.slice(i + entete.length + 2, css.indexOf('}', i))
  const out: Record<string, string> = {}
  for (const m of corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const clair = bloc(':root')
const sombreSysteme = bloc("  :root:not([data-theme='light'])")
const sombreChoisi = bloc(":root[data-theme='dark'],\nhtml.studio")

/** Résout `var(--x)` dans un thème (valeurs sombres, sinon claires). */
function valeur(theme: Record<string, string>, nom: string): string {
  let v = theme[nom] ?? clair[nom]
  for (let n = 0; n < 5 && v?.startsWith('var('); n++) {
    const ref = v.slice(4, -1).trim()
    v = theme[ref] ?? clair[ref]
  }
  expect(v, `jeton ${nom} introuvable`).toBeTruthy()
  return v
}

function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
/** Écart perceptif OKLab ×100 entre deux couleurs (#rrggbb). */
function ecartOklab(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl)
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
  }
  const [x, y] = [lab(a), lab(b)]
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const COULEURS = Object.keys(clair).filter((k) => /^(#|rgba?\()/.test(clair[k]) || clair[k].startsWith('var(--'))
  .filter((k) => !k.startsWith('--font') && !k.startsWith('--fs') && !k.startsWith('--s') && k !== '--space' && !k.startsWith('--radius'))

describe('jetons de couleur', () => {
  it('les deux blocs sombres sont identiques', () => {
    expect(sombreSysteme).toEqual(sombreChoisi)
  })

  it('chaque couleur du thème clair existe en sombre (donc en studio)', () => {
    const manquants = COULEURS.filter((k) => !(k in sombreChoisi) && !['--text-on-accent'].includes(k))
    expect(manquants).toEqual([])
  })

  for (const [nom, theme] of [['clair', {}], ['sombre', sombreChoisi]] as const) {
    describe(`thème ${nom}`, () => {
      const v = (k: string) => valeur(theme, k)
      it('texte courant et secondaire lisibles (AA)', () => {
        expect(contraste(v('--text'), v('--bg'))).toBeGreaterThanOrEqual(7)
        expect(contraste(v('--text-2'), v('--bg'))).toBeGreaterThanOrEqual(4.5)
        expect(contraste(v('--muted'), v('--bg'))).toBeGreaterThanOrEqual(4.5)
        expect(contraste(v('--muted'), v('--surface-2'))).toBeGreaterThanOrEqual(4.5)
        expect(contraste(v('--accent'), v('--bg'))).toBeGreaterThanOrEqual(4.5)
      })
      it('texte à l’encre sur les fonds teintés du sémaphore (AA)', () => {
        for (const t of ['good', 'warn', 'bad']) expect(contraste(v('--text'), v(`--${t}-tint`))).toBeGreaterThanOrEqual(4.5)
      })
      it('glyphe posé sur la couleur du sémaphore (AA)', () => {
        for (const t of ['good', 'warn', 'bad']) expect(contraste(v(`--on-${t}`), v(`--${t}`))).toBeGreaterThanOrEqual(4.5)
      })
      it('lettre de la tuile B de la classe calculée, sur le degré clair de l’orange (AA, lot 1)', () => {
        expect(contraste(v('--on-warn-line'), v('--warn-line'))).toBeGreaterThanOrEqual(4.5)
      })
      it('formes du sémaphore visibles sur le fond (≥ 3:1), par leur couleur ou par leur contour', () => {
        for (const t of ['good', 'warn-line', 'warn', 'bad', 'bad-fort'])
          expect(Math.max(contraste(v(`--${t}`), v('--bg')), contraste(v('--contour-forme'), v('--bg'))), `--${t}`).toBeGreaterThanOrEqual(3)
      })
      it('une seule palette, celle de la carte (auteur, 07/10) : le sémaphore reprend les paliers --q2 à --q5', () => {
        expect(v('--good')).toBe(v('--q2'))
        expect(v('--good-line')).toBe(v('--q2'))
        expect(v('--warn-line')).toBe(v('--q3'))
        expect(v('--warn')).toBe(v('--q4'))
        expect(v('--bad')).toBe(v('--q5'))
      })
    })
  }

  it('rampe ardoise monotone : de plus en plus foncée en clair, de plus en plus claire en sombre', () => {
    const rampe = (t: Record<string, string>) => [1, 2, 3, 4, 5].map((i) => luminance(valeur(t, `--m${i}`)))
    const c = rampe({})
    const s = rampe(sombreChoisi)
    for (let i = 1; i < 5; i++) {
      expect(c[i]).toBeLessThan(c[i - 1])
      expect(s[i]).toBeGreaterThan(s[i - 1])
    }
    // premier palier à au moins 2:1 du fond, pour qu'aucun département ne se confonde avec lui
    expect(contraste(valeur({}, '--m1'), valeur({}, '--bg'))).toBeGreaterThanOrEqual(2)
    expect(contraste(valeur(sombreChoisi, '--m1'), valeur(sombreChoisi, '--bg'))).toBeGreaterThanOrEqual(2)
  })

  it('rampe de la qualité de l’eau (ColorBrewer RdYlBu, 05/10) : paliers voisins distincts, noms lisibles en clair', () => {
    for (const t of [{}, sombreChoisi]) {
      for (let i = 1; i < 5; i++) expect(ecartOklab(valeur(t, `--q${i}`), valeur(t, `--q${i + 1}`)), `--q${i}/--q${i + 1}`).toBeGreaterThanOrEqual(12)
      expect(contraste(valeur(t, '--q1'), valeur(t, '--bg'))).toBeGreaterThanOrEqual(2)
    }
    for (let i = 1; i <= 5; i++) expect(contraste(valeur({}, '--text'), valeur({}, `--q${i}`)), `--q${i}`).toBeGreaterThanOrEqual(3.5)
  })
})

/**
 * Daltonismes (05/10, « une solution pour les daltoniens et la vision normale en même temps ») : dans chaque échelle
 * peinte, toute paire de couleurs reste distincte en vision normale et sous deutéranopie, protanopie et tritanopie
 * (matrices de Machado, Oliveira et Fernandes, 2009, sévérité maximale), en clair comme en sombre.
 */
describe('palettes lisibles sous daltonisme', () => {
  const MATRICES: Record<string, number[][]> = {
    deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
    protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
  }
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const gam = (c: number) => {
    const x = Math.min(Math.max(c, 0), 1)
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }
  const simuler = (hex: string, m: number[][]) => {
    const v = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255))
    return '#' + m.map((ligne) => Math.round(gam(ligne[0] * v[0] + ligne[1] * v[1] + ligne[2] * v[2]) * 255).toString(16).padStart(2, '0')).join('')
  }
  const ECHELLES: [string, string[], number][] = [
    ['notes A–D (gouttes, tuiles, répartition)', ['--good', '--warn-line', '--warn', '--bad'], 13],
    ['pesticides (communes)', ['--good-line', '--warn-line', '--warn', '--bad'], 13],
    ['PFAS, métaux, autres, toutes (communes)', ['--good-line', '--warn', '--bad'], 13],
    ['avis de l’ARS', ['--d0', '--warn', '--bad', '--bad-fort'], 13],
    ['restrictions', ['--d0', '--bad'], 13],
    ['sécheresse', ['--good-line', '--warn-line', '--warn', '--bad', '--bad-fort'], 13],
  ]
  for (const [nom, theme] of [['clair', {}], ['sombre', sombreChoisi]] as const) {
    for (const [echelle, jetons, seuil] of ECHELLES) {
      it(`${echelle}, thème ${nom} : toute paire à ΔE ≥ ${seuil} dans les quatre visions`, () => {
        const couleurs = jetons.map((j) => valeur(theme, j))
        for (const m of [null, ...Object.values(MATRICES)]) {
          const vues = m ? couleurs.map((c) => simuler(c, m)) : couleurs
          for (let i = 0; i < vues.length; i++)
            for (let k = i + 1; k < vues.length; k++) expect(ecartOklab(vues[i], vues[k]), `${jetons[i]}/${jetons[k]}`).toBeGreaterThanOrEqual(seuil)
        }
      })
    }
    it(`rampe de la qualité de l’eau, thème ${nom} : paliers voisins à ΔE ≥ 10 dans les quatre visions`, () => {
      const couleurs = [1, 2, 3, 4, 5].map((i) => valeur(theme, `--q${i}`))
      for (const m of [null, ...Object.values(MATRICES)]) {
        const vues = m ? couleurs.map((c) => simuler(c, m)) : couleurs
        for (let i = 1; i < 5; i++) expect(ecartOklab(vues[i - 1], vues[i]), `--q${i}/--q${i + 1}`).toBeGreaterThanOrEqual(10)
      }
    })
  }
})

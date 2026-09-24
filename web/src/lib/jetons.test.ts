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
      it('formes du sémaphore visibles sur le fond (≥ 3:1)', () => {
        for (const t of ['good', 'warn', 'bad']) expect(contraste(v(`--${t}`), v('--bg'))).toBeGreaterThanOrEqual(3)
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
})

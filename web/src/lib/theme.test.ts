// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleTheme } from './theme'

/** La clé suit la page elle-même : attribut `data-theme` (choix du visiteur) et classe studio (scènes vidéo). */
describe('cleTheme', () => {
  const root = document.documentElement
  afterEach(() => {
    delete root.dataset.theme
    root.classList.remove('studio')
  })

  it('sans choix ni préférence système sombre, le thème affiché est le clair', () => {
    expect(cleTheme()).toBe('clair')
  })
  it('suit le choix du visiteur dans les deux sens', () => {
    root.dataset.theme = 'dark'
    expect(cleTheme()).toBe('sombre')
    root.dataset.theme = 'light'
    expect(cleTheme()).toBe('clair')
  })
  it('le mode studio l’emporte, même sur un choix clair', () => {
    root.dataset.theme = 'light'
    root.classList.add('studio')
    expect(cleTheme()).toBe('studio')
  })
})

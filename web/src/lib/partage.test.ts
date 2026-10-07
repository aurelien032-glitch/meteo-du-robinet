import { describe, expect, it } from 'vitest'
import { liensPartage } from './partage'

describe('partage d’une page', () => {
  const url = 'https://meteodurobinet.fr/carte?indic=restrictions&annee=2025'
  const titre = 'Carte des départements · Météo du robinet'
  const [linkedin, facebook, courriel] = liensPartage(url, titre)

  it('LinkedIn et Facebook reçoivent l’adresse entière, vue comprise, encodée', () => {
    expect(linkedin.href).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`)
    expect(new URL(linkedin.href).searchParams.get('url')).toBe(url)
    expect(new URL(facebook.href).searchParams.get('u')).toBe(url)
    expect([linkedin.externe, facebook.externe]).toEqual([true, true])
  })
  it('le courriel porte le titre en objet, le titre et l’adresse dans le corps, sans destinataire', () => {
    expect(courriel.href.startsWith('mailto:?subject=')).toBe(true)
    const q = new URLSearchParams(courriel.href.slice('mailto:?'.length))
    expect(q.get('subject')).toBe(titre)
    expect(q.get('body')).toBe(`${titre}\n${url}`)
    expect(courriel.externe).toBe(false)
  })
})

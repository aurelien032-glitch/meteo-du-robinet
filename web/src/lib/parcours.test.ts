import { describe, expect, it } from 'vitest'
import { communesTheme, lienCommunesCarte, lienDepartement, liensAvecCommunes, MENU, nomSection, sectionDe, sujetTheme } from './parcours'

describe('liens vers la fiche département', () => {
  it('garde le sujet : une vue par indic, une section par ancre, rien sans sujet', () => {
    expect(lienDepartement('02', { indic: 'pesticides' })).toBe('/departement/02?indic=pesticides')
    expect(lienDepartement('33', { section: 'services' })).toBe('/departement/33#services')
    expect(lienDepartement('2A', null)).toBe('/departement/2A')
    expect(lienDepartement('971')).toBe('/departement/971')
  })
  it('substances sans limite : la section, et le groupe regardé sur /hors-grille', () => {
    expect(lienDepartement('35', { section: 'hors-grille', groupe: 'tfa' })).toBe('/departement/35?groupe=tfa#hors-grille')
    expect(lienDepartement('35', { section: 'hors-grille' })).toBe('/departement/35#hors-grille')
  })
  it('famille de chaque thème dans les clés de la fiche ; la radioactivité n’en a pas', () => {
    expect(['pesticides', 'nitrates', 'pfas', 'bacteries', 'metaux', 'radioactivite'].map(sujetTheme)).toEqual([
      { indic: 'pesticides' },
      { indic: 'azote' },
      { indic: 'pfas' },
      { indic: 'microbio' },
      { indic: 'metaux' },
      null,
    ])
    expect(sujetTheme(undefined)).toBeNull()
  })
  it('communes d’un département sur la carte, avec les réglages de la page', () => {
    expect(lienCommunesCarte('02', 'avis')).toBe('/carte?indic=avis&dept=02')
    expect(lienCommunesCarte('33', 'prix', { sispea: '2024' })).toBe('/carte?indic=prix&sispea=2024&dept=33')
    expect(communesTheme('02', 'nitrates')).toBe('/carte?indic=azote&dept=02')
    expect(communesTheme('02', 'radioactivite')).toBeUndefined()
  })
  it('l’encart descend toujours d’un niveau : sans vue communale, vers les communes sur la qualité de l’eau', () => {
    const fiche = lienDepartement('69', { section: 'ressource' })
    expect(liensAvecCommunes({ fiche }, '69')).toEqual({ fiche, communesQualite: '/carte?indic=any&dept=69' })
    expect(liensAvecCommunes({ fiche, communes: communesTheme('2A', 'radioactivite') }, '2A').communesQualite).toBe('/carte?indic=any&dept=2A')
    // Une carte qui a sa vue communale la garde, sans lien de plus.
    const avecVue = { fiche, communes: lienCommunesCarte('69', 'avis') }
    expect(liensAvecCommunes(avecVue, '69')).toBe(avecVue)
    const action = () => {}
    expect(liensAvecCommunes({ fiche, communes: action }, '69').communesQualite).toBeUndefined()
  })
})

describe('menu de la refonte (lot 2, 05/10)', () => {
  it('cinq entrées dans l’ordre de la maquette', () => {
    expect(MENU.map(([, n]) => n)).toEqual(['Mon eau', 'La France', 'Sujets', 'La ressource', 'Méthode'])
  })
  it('entrée allumée : fiches sous Mon eau, La France, carte et département sous La France, sujets, ressource, méthode', () => {
    const cas: [string, string | null][] = [
      ['/', null],
      ['/ma-commune', '/ma-commune'],
      ['/commune/02691', '/ma-commune'],
      ['/commune/35238/analyses', '/ma-commune'],
      ['/reseau/035004230', '/ma-commune'],
      ['/service/77654', '/ma-commune'],
      ['/france', '/france'],
      ['/carte', '/france'],
      ['/departement/35', '/france'],
      ['/themes', '/themes'],
      ['/themes/pfas', '/themes'],
      ['/avis', '/themes'],
      ['/hors-grille', '/themes'],
      ['/ressource-en-eau', '/ressource-en-eau'],
      ['/ressource', '/ressource-en-eau'],
      ['/secheresse', '/ressource-en-eau'],
      ['/nappes', '/ressource-en-eau'],
      ['/amont', '/ressource-en-eau'],
      ['/services', '/ressource-en-eau'],
      ['/methode', '/methode'],
      ['/mentions-legales', '/methode'],
      ['/scene', null],
    ]
    for (const [p, s] of cas) expect([p, sectionDe(p)]).toEqual([p, s])
    expect(nomSection('/ressource-en-eau')).toBe('La ressource')
    expect(nomSection('/france')).toBe('La France')
  })
})

import { describe, expect, it } from 'vitest'
import { CHARNIERES, deDepartement, deDepartements } from './departements'

describe('deDepartement', () => {
  it('les 101 départements du pipeline (config.DEPARTEMENTS), chacun une fois', () => {
    const attendus = [...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')).filter((c) => c !== '20'), '2A', '2B', '971', '972', '973', '974', '976']
    expect(Object.keys(CHARNIERES).sort()).toEqual(attendus.sort())
  })

  it('charnière du code officiel géographique', () => {
    expect(deDepartement('38', 'Isère')).toBe('de l’Isère')
    expect(deDepartement('69', 'Rhône')).toBe('du Rhône')
    expect(deDepartement('73', 'Savoie')).toBe('de la Savoie')
    expect(deDepartement('92', 'Hauts-de-Seine')).toBe('des Hauts-de-Seine')
    expect(deDepartement('35', 'Ille-et-Vilaine')).toBe('d’Ille-et-Vilaine')
    expect(deDepartement('75', 'Paris')).toBe('de Paris')
    expect(deDepartement('974', 'La Réunion')).toBe('de La Réunion')
    expect(deDepartement('90', 'Territoire de Belfort')).toBe('du Territoire de Belfort')
    expect(deDepartement('2B', 'Haute-Corse')).toBe('de la Haute-Corse')
    expect(deDepartement('977', 'Saint-Barthélemy')).toBe('du département Saint-Barthélemy')
  })

  it('plusieurs départements', () => {
    const noms: Record<string, string> = { '01': 'Ain', '38': 'Isère', '69': 'Rhône' }
    expect(deDepartements(['38'], (c) => noms[c])).toBe('de l’Isère')
    expect(deDepartements(['01', '38'], (c) => noms[c])).toBe('de l’Ain et de l’Isère')
    expect(deDepartements(['01', '69', '38'], (c) => noms[c])).toBe('de l’Ain, du Rhône et de l’Isère')
  })
})

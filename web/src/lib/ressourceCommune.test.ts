import { describe, expect, it } from 'vitest'
import { deLieu, nappeCommune, origineCommune, phraseNappe, phraseOrigine } from './ressourceCommune'
import type { AmontDeptFile, NappesDept, NappesNational, Piezometre } from './types'
import { secheresseCommune, type ZoneVigiEau } from './vigieau'

const ESPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
const net = (s: string) => s.replace(ESPACES, ' ')

// Rennes (amont/dept/35.json, nappes/35.json, nappes/national.json), réduit aux champs lus.
const ouvrage = (volumes: Record<string, number | null>, commune = '35238') => ({ nom: null, commune, milieu: 'SOUT', lon: null, lat: null, volumes })
const AMONT: AmontDeptFile = {
  ouvrages: {
    OPR0000540194: ouvrage({ '2022': 948499, '2023': 12611 }),
    OPR0000081998: ouvrage({ '2022': 164455, '2023': 177139 }),
    OPR0000082000: ouvrage({ '2022': 402420, '2023': 346040 }),
    OPR0000081999: ouvrage({ '2022': 528545, '2023': 553505 }),
    AILLEURS: ouvrage({ '2024': 1 }, '35051'),
  },
  nappes: {},
}
const CLASSES = ['très bas', 'bas', 'modérément bas', 'autour de la normale', 'modérément haut', 'haut', 'très haut']
const NAT = { classes: CLASSES, mois_ref: '2026-08' } as NappesNational
const piezo = (classes: Record<string, number>): Piezometre => ({
  insee: '35278',
  commune: 'Saint-Grégoire',
  nappe: 'Bassin versant de la Vilaine',
  prof: null,
  xy: [null, null],
  debut: '2005-01-12',
  serie: [],
  normale: {},
  classes,
})
const ND: NappesDept = { mois_ref: '2026-08', piezometres: { '03172X0088/PZ': piezo({ '2026-08': 3 }) }, communes: { '35238': ['03172X0088/PZ', 5.5], '35999': ['03172X0088/PZ', 52] } }

describe('la ressource autour de la commune', () => {
  it('origine : quatre ouvrages, une seule année déclarée', () => {
    const o = origineCommune(AMONT, '35238')
    expect(o).toEqual({ ouvrages: 4, annee: '2023', volume: 1089295, declares: 4 })
    expect(net(phraseOrigine(o))).toBe('4 ouvrages de prélèvement pour l’eau potable sur la commune, 1 089 295 m³ prélevés en 2023.')
    expect(net(phraseOrigine({ ouvrages: 3, annee: '2024', volume: 10, declares: 1 }))).toBe(
      '3 ouvrages de prélèvement pour l’eau potable sur la commune, 10 m³ prélevés en 2024 par le seul ouvrage déclaré cette année-là.',
    )
    expect(net(phraseOrigine({ ouvrages: 3, annee: '2024', volume: 10, declares: 2 }))).toContain('par les 2 ouvrages déclarés cette année-là.')
    expect(phraseOrigine(origineCommune(AMONT, '35000'))).toBe('Aucun ouvrage de prélèvement pour l’eau potable sur la commune : l’eau vient d’ailleurs, par le réseau.')
  })

  it('nappe : le piézomètre le plus proche à moins de 40 km, classé sur les mêmes mois passés', () => {
    const n = nappeCommune(NAT, ND, '35238')!
    expect(n).toEqual({ code: '03172X0088/PZ', commune: 'Saint-Grégoire', nappe: 'Bassin versant de la Vilaine', distance: 5.5, classe: 3, mois: '2026-08', depuis: '2005' })
    expect(phraseNappe(n, CLASSES)).toBe('Piézomètre de Saint-Grégoire (6 km), Bassin versant de la Vilaine : niveau autour de la normale en août 2026, par rapport aux mêmes mois depuis 2005.')
    expect(phraseNappe({ ...n, classe: null }, CLASSES)).toBe('Piézomètre de Saint-Grégoire (6 km), Bassin versant de la Vilaine : pas de mesure exploitable en août 2026.')
    expect(phraseNappe({ ...n, commune: 'Anneville-en-Saire' }, CLASSES)).toMatch(/^Piézomètre d’Anneville-en-Saire \(6 km\)/)
    expect(nappeCommune(NAT, ND, '35999')).toBeNull()
    expect(nappeCommune(NAT, ND, '35000')).toBeNull()
  })

  it('« de » devant un nom de lieu, élidé ou contracté', () => {
    expect(['Anneville-en-Saire', 'Le Havre', 'Les Sables-d’Olonne', 'Saint-Grégoire', 'Évreux', 'Honfleur', '03172X0088/PZ'].map((x) => deLieu(x).join(''))).toEqual([
      'd’Anneville-en-Saire',
      'du Havre',
      'des Sables-d’Olonne',
      'de Saint-Grégoire',
      'd’Évreux',
      'de Honfleur',
      'de 03172X0088/PZ',
    ])
  })

  it('sécheresse : la zone la plus sévère donne le niveau ; aucune restriction, niveau 0', () => {
    const z = (id: number, niveauGravite: string | null): ZoneVigiEau => ({ id, nom: `Zone ${id}`, type: 'SUP', niveauGravite })
    const s = secheresseCommune([z(1, 'vigilance'), z(2, 'alerte_renforcee'), z(3, null), z(4, 'alerte')])
    expect([s.niveau, s.pire?.id, s.actives.map((x) => x.id)]).toEqual([3, 2, [1, 2, 4]])
    expect(secheresseCommune([z(1, null)])).toEqual({ niveau: 0, actives: [], pire: null })
    expect(secheresseCommune([]).niveau).toBe(0)
  })
})

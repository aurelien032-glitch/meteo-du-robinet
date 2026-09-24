import { describe, expect, it } from 'vitest'
import { classeArdoise, ETIQUETTES_ARDOISE, etiquettesVisibles, lectureDepartement, lignesDepartements, lignesEtiquette, pctCarte } from './carte'
import { palierArdoise, PALIERS_ARDOISE } from './scale'

const NB = String.fromCharCode(0xa0)

describe('rampe ardoise de la carte', () => {
  it('cinq classes aux bornes 5, 10, 20 et 40 %, chacune ouverte à sa borne ; 0 sans réseau analysé', () => {
    expect([null, 0, 0.049, 0.05, 0.0999, 0.1, 0.2, 0.39, 0.4, 1].map(classeArdoise)).toEqual([0, 1, 1, 2, 2, 3, 4, 4, 5, 5])
    expect(ETIQUETTES_ARDOISE).toEqual(['< 5', '5–10', '10–20', '20–40', '≥ 40'])
  })
  it('les classes de la carte et les paliers de l’échelle des autres cartes viennent des mêmes bornes', () => {
    for (const b of PALIERS_ARDOISE) expect(classeArdoise(b)).toBe(palierArdoise(b) + 1)
  })
})

describe('pctCarte', () => {
  it('une décimale sous 10 %, aucune au-delà', () => {
    expect([0.0753, 0.0336, 0.1029, 0.5955, 0].map(pctCarte)).toEqual([`7,5${NB}%`, `3,4${NB}%`, `10${NB}%`, `60${NB}%`, `0,0${NB}%`])
  })
  it('ne franchit jamais une borne de la légende à l’arrondi', () => {
    expect(pctCarte(0.0997)).toBe(`9,97${NB}%`)
    expect(pctCarte(0.396)).toBe(`39,6${NB}%`)
    expect(pctCarte(0.3996)).toBe(`39,96${NB}%`)
    expect(pctCarte(0.1)).toBe(`10${NB}%`)
  })
})

// Répartitions 2025 publiées (situations/2025.json, famille « toutes ») : conformes, non conformes, restriction.
const DEPTS = {
  '35': { toutes: [86, 7, 0, 0] as [number, number, number, number] },
  '50': { toutes: [144, 4, 1, 0] as [number, number, number, number] },
  '31': { toutes: [157, 8, 10, 0] as [number, number, number, number] },
  '51': { toutes: [127, 186, 1, 0] as [number, number, number, number] },
}
const NOMS = { '35': 'Ille-et-Vilaine', '50': 'Manche', '31': 'Haute-Garonne', '51': 'Marne', '975': 'Saint-Pierre-et-Miquelon' }

describe('tableau et lecture des départements', () => {
  it('un par département du dessin, de la plus forte part à la plus faible, les départements sans donnée en dernier', () => {
    const l = lignesDepartements(DEPTS, NOMS)
    expect(l.map((x) => [x.nom, x.nonConformes, x.analyses])).toEqual([
      ['Marne', 187, 314],
      ['Haute-Garonne', 18, 175],
      ['Ille-et-Vilaine', 7, 93],
      ['Manche', 5, 149],
      ['Saint-Pierre-et-Miquelon', 0, 0],
    ])
    expect(l.at(-1)?.part).toBeNull()
    expect(l.map((x) => classeArdoise(x.part))).toEqual([5, 3, 2, 1, 0])
  })
  it('lecture en une phrase, accordée', () => {
    const [marne] = lignesDepartements(DEPTS, NOMS)
    expect(lectureDepartement(marne)).toBe(`Marne : 60${NB}% des réseaux non conformes, 187 sur 314 analysés`)
    expect(lectureDepartement({ nom: 'Réseau seul', part: 0, nonConformes: 0, analyses: 1 })).toBe(`Réseau seul : 0,0${NB}% des réseaux non conformes, 0 sur 1 analysé`)
    expect(lectureDepartement({ nom: 'Saint-Pierre-et-Miquelon', part: null, nonConformes: 0, analyses: 0 })).toBe('Saint-Pierre-et-Miquelon : aucun réseau analysé')
  })
})

describe('étiquettes de la carte', () => {
  it('un nom long passe sur deux lignes, là où la plus longue est la plus courte', () => {
    expect(lignesEtiquette('Manche')).toEqual(['Manche'])
    expect(lignesEtiquette('Alpes-de-Haute-Provence')).toEqual(['Alpes-de-', 'Haute-Provence'])
    expect(lignesEtiquette('Territoire de Belfort')).toEqual(['Territoire', 'de Belfort'])
    expect(lignesEtiquette('Ille-et-Vilaine')).toEqual(['Ille-et-', 'Vilaine'])
    expect(lignesEtiquette('Pyrénées-Atlantiques')).toEqual(['Pyrénées-', 'Atlantiques'])
    expect(lignesEtiquette('Abcdefghijklmnopqr')).toEqual(['Abcdefghijklmnopqr'])
  })
  it('les étiquettes qui se chevauchent cèdent la place à celle du plus grand département', () => {
    const b = (code: string, x: number, priorite: number) => ({ code, x, y: 0, w: 10, h: 4, priorite })
    expect([...etiquettesVisibles([b('petit', 5, 1), b('grand', 0, 9), b('loin', 30, 2)])].sort()).toEqual(['grand', 'loin'])
    expect([...etiquettesVisibles([b('a', 0, 2), b('b', 11, 1)], 2)]).toEqual(['a'])
    // une étiquette qui sortirait du dessin est écartée, même prioritaire
    expect([...etiquettesVisibles([b('bord', 995, 9), b('dedans', 500, 1)], 0, { largeur: 1000, hauteur: 1000 })]).toEqual(['dedans'])
  })
})

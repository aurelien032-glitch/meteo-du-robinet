import { describe, expect, it } from 'vitest'
import {
  BORNES_RESTRICTIONS,
  causesRestriction,
  classePart,
  ETIQUETTES_PARTS,
  ETIQUETTES_RESTRICTIONS,
  etiquettesVisibles,
  lignesDepartements,
  lignesEtiquette,
  partRestrictions,
  pctCarte,
  pctRestrictions,
} from './carte'
import { palierPart, PALIERS_PARTS } from './scale'
import { codeFamille } from './situations'

const NB = String.fromCharCode(0xa0)

describe('rampe des parts de la carte', () => {
  it('quatre classes aux bornes 10, 25 et 50 % (couleurs des notes, 07/10), chacune ouverte à sa borne ; 0 sans réseau analysé', () => {
    expect([null, 0, 0.0999, 0.1, 0.2499, 0.25, 0.49, 0.5, 1].map(classePart)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
    expect(ETIQUETTES_PARTS).toEqual(['< 10', '10–25', '25–50', '≥ 50'])
  })
  it('les classes de la carte et les paliers de l’échelle des autres cartes viennent des mêmes bornes', () => {
    for (const b of PALIERS_PARTS) expect(classePart(b)).toBe(palierPart(b) + 1)
  })
})

describe('pctCarte', () => {
  it('une décimale partout (règle des décimales du 2026-10-05)', () => {
    expect([0.0753, 0.0336, 0.1029, 0.5955, 0].map(pctCarte)).toEqual([`7,5${NB}%`, `3,4${NB}%`, `10,3${NB}%`, `59,6${NB}%`, `0,0${NB}%`])
  })
  it('ne franchit jamais une borne de la légende à l’arrondi', () => {
    expect(pctCarte(0.0997)).toBe(`9,97${NB}%`)
    expect(pctCarte(0.396)).toBe(`39,6${NB}%`)
    expect(pctCarte(0.2497)).toBe(`24,97${NB}%`)
    expect(pctCarte(0.4996)).toBe(`49,96${NB}%`)
    expect(pctCarte(0.1)).toBe(`10,0${NB}%`)
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
    expect(l.map((x) => classePart(x.part))).toEqual([4, 2, 1, 1, 0])
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

describe('restrictions de consommation', () => {
  it('part des réseaux sous restriction ou consigne : la classe 2 de « toutes familles » ; null sans réseau analysé', () => {
    // Haute-Garonne 2025 (situations/2025.json) : 157 conformes, 8 non conformes, 10 sous restriction ou consigne.
    expect(partRestrictions([157, 8, 10, 0])).toBeCloseTo(10 / 175)
    expect(partRestrictions([86, 7, 0, 0])).toBe(0)
    expect(partRestrictions([0, 0, 0, 0])).toBeNull()
    expect(partRestrictions(undefined)).toBeNull()
  })
  it('paliers : « aucun réseau » à part, puis 2, 5 et 10 % ; une étiquette par palier', () => {
    expect(BORNES_RESTRICTIONS).toHaveLength(ETIQUETTES_RESTRICTIONS.length)
    expect(ETIQUETTES_RESTRICTIONS[0]).toBe('aucun réseau')
    // un seul réseau sur 2 000 n'est pas « aucun »
    expect(1 / 2000).toBeGreaterThanOrEqual(BORNES_RESTRICTIONS[1])
  })
  it('écrite sans franchir une borne de sa légende', () => {
    expect(pctRestrictions(0.0199)).toBe(`1,99${NB}%`)
    expect(pctRestrictions(0.0571)).toBe(`5,7${NB}%`)
    expect(pctRestrictions(0.0999)).toBe(`9,99${NB}%`)
    expect(pctRestrictions(0.13)).toBe(`13,0${NB}%`)
  })
  it('familles en cause, dans l’ordre des codes ; les nitrates ne valent jamais restriction', () => {
    // ordre : pesticides, nitrates, PFAS, bactériologie, métaux et minéraux ; « - » : famille non analysée
    expect(causesRestriction('300300')).toEqual(['pesticides', 'bactériologie'])
    expect(causesRestriction('3--020')).toEqual(['pesticides', 'métaux et minéraux'])
    // nitrates en classe 3 (au-delà de 50 mg/L) et bactériologie en classe 2 (moins de 95 %) : pas de restriction
    expect(causesRestriction('330200')).toEqual(['pesticides'])
    expect(causesRestriction('030200')).toEqual([])
    expect(causesRestriction(null)).toEqual([])
    // cohérent avec la classe « toutes familles »
    expect(codeFamille('300300', 'toutes')).toBe(2)
    expect(codeFamille('030200', 'toutes')).toBe(1)
  })
})

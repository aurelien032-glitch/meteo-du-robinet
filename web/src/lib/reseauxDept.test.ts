import { describe, expect, it } from 'vitest'
import { reseauxClassesCD, reseauxFamilleAlpha, type IndexReseaux } from './reseauxDept'
import type { SituationsFile } from './situations'
import type { DeptFile } from './types'

// Codes de situation : un chiffre par famille (pesticides, nitrates, PFAS, bactériologie, métaux), « - » non analysée.
const situ = {
  familles: [],
  depts: {},
  national: {},
  reseaux: {
    '035000001': '200000', // pesticides plus de 30 jours
    '035000002': '030000', // nitrates au-dessus de 50 mg/L
    '035000003': '020000', // nitrates de 40 à 50 mg/L : retenu comme sur la carte
    '035000004': '010000', // nitrates de 25 à 40 : non retenu
    '035000005': '0003-0', // restriction : bactériologie sous consigne (quatrième famille), métaux non analysés
    '035000006': '-----0', // rien d'analysé
    '056000001': '300000', // autre département
  },
} as unknown as SituationsFile
const index: IndexReseaux = { c: ['035000001', 1, 1, 1, 1, 1], n: ['RENNES NORD', 'VITRE', 'FOUGERES', 'REDON', 'DINARD', 'SAINT-MALO'], k: [12, 3, 5, 1, 2, 1] }

describe('réseaux concernés d’un département (sans fichier du département : par nom de réseau)', () => {
  it('pesticides : les réseaux non conformes du département seulement, analysés comptés ; nom lisible', () => {
    const r = reseauxFamilleAlpha(situ, index, null, '35', 2025, 'pesticides')
    expect(r.lignes.map((l) => [l.code, l.nom, l.classe])).toEqual([['035000001', 'Rennes Nord', 2]])
    expect(r.analyses).toBe(5)
  })
  it('nitrates : dès 40 mg/L, sans ordre de gravité', () => {
    expect(reseauxFamilleAlpha(situ, index, null, '35', 2025, 'azote').lignes.map((l) => l.code)).toEqual(['035000003', '035000002'])
  })
  it('restrictions : réseaux sous restriction ou consigne de l’ARS', () => {
    expect(reseauxFamilleAlpha(situ, index, null, '35', 2025, 'restriction').lignes.map((l) => [l.nom, l.classe])).toEqual([['Dinard', 2]])
  })
  it('PFAS : dans « toutes familles » comme dans la vue des PFAS (limite applicable depuis 2023)', () => {
    const pfas = { ...situ, reseaux: { '035000010': '001000', '035000011': '002000', '035000012': '000000' } } as SituationsFile
    expect(reseauxFamilleAlpha(pfas, null, null, '35', 2025, 'toutes').lignes.map((l) => l.code)).toEqual(['035000010', '035000011'])
    expect(reseauxFamilleAlpha(pfas, null, null, '35', 2025, 'pfas').lignes.map((l) => l.code)).toEqual(['035000010', '035000011'])
  })
  it('sans index de la recherche : le code tient lieu de nom', () => {
    expect(reseauxFamilleAlpha(situ, null, null, '35', 2025, 'pesticides').lignes[0]).toEqual({ code: '035000001', nom: '035000001', communes: [], classe: 2 })
  })
})

describe('réseaux classés C ou D d’un département (tête de la fiche, lot 3)', () => {
  const classes = {
    ...situ,
    classes: { '035000001': 'CAAAAA', '035000002': 'ABAAAA', '035000003': 'AAADAA', '035000005': 'AAADA-', '056000001': 'DAAAAA' },
  } as unknown as SituationsFile
  const dept = {
    dept: '35',
    annees: [2025],
    reseaux: { '035000003': { nom: 'UDI FOUGERES', dist: null, uge: null, communes: [] } },
    communes: {
      '35238': { nom: 'Rennes', reseaux: { '2025': ['035000001'] }, stats: {} },
      '35001': { nom: 'Acigné', reseaux: { '2025': ['035000001'] }, stats: {} },
      '35115': { nom: 'Fougères', reseaux: { '2025': ['035000003'] }, stats: {} },
      '35093': { nom: 'Dinard', reseaux: { '2025': ['035000005'], '2024': ['035000002'] }, stats: {} },
      '35288': { nom: 'Saint-Malo', reseaux: { '2025': ['035000005'] }, stats: {} },
    },
  } as unknown as DeptFile
  it('C et D seulement, du département seulement, par ordre alphabétique de la première commune desservie', () => {
    const r = reseauxClassesCD(classes, index, dept, '35', 2025)
    expect(r.lignes.map((l) => [l.code, l.lettre, l.communes])).toEqual([
      ['035000001', 'C', ['Acigné', 'Rennes']],
      ['035000005', 'D', ['Dinard', 'Saint-Malo']],
      ['035000003', 'D', ['Fougères']],
    ])
    // Réseaux classés : les six du département ont au moins une famille analysée (035000006, la sixième seulement) ;
    // celui du Morbihan n'est pas compté.
    expect(r.classes).toBe(6)
  })
  it('noms lisibles, tirés de l’index de la recherche ou, à défaut, du fichier du département', () => {
    const r = reseauxClassesCD(classes, null, dept, '35', 2025)
    expect(r.lignes.map((l) => l.nom)).toEqual(['035000001', '035000005', 'Fougeres'])
    expect(reseauxClassesCD(classes, index, dept, '35', 2025).lignes.map((l) => l.nom)).toEqual(['Rennes Nord', 'Dinard', 'Fougeres'])
  })
  it('noms officiels des communes quand ils sont donnés (le fichier du département les écrit en capitales)', () => {
    const noms = new Map([['35093', 'Dinard'], ['35288', 'Saint-Malo'], ['35001', 'Zénith']])
    const r = reseauxClassesCD(classes, index, dept, '35', 2025, noms)
    expect(r.lignes[0].communes).toEqual(['Dinard', 'Saint-Malo'])
    expect(r.lignes.map((l) => l.code)).toEqual(['035000005', '035000003', '035000001'])
  })
  it('sans fichier du département : la liste reste, par nom de réseau', () => {
    expect(reseauxClassesCD(classes, index, null, '35', 2025).lignes.map((l) => l.nom)).toEqual(['Dinard', 'Fougeres', 'Rennes Nord'])
  })
})

describe('réseaux concernés d’une famille, par ordre alphabétique de commune (pages de sujets, lot 4)', () => {
  const dept = {
    dept: '35',
    annees: [2025],
    reseaux: {},
    communes: {
      '35238': { nom: 'Rennes', reseaux: { '2025': ['035000001'] }, stats: {} },
      '35115': { nom: 'Fougères', reseaux: { '2025': ['035000003'] }, stats: {} },
      '35360': { nom: 'Vitré', reseaux: { '2025': ['035000002'] }, stats: {} },
      '35001': { nom: 'Acigné', reseaux: { '2025': ['035000002', '035000004'] }, stats: {} },
    },
  } as unknown as DeptFile
  it('nitrates : dès 40 mg/L comme la carte, dans l’ordre alphabétique de la première commune, pas de la gravité', () => {
    const r = reseauxFamilleAlpha(situ, index, dept, '35', 2025, 'azote')
    expect(r.lignes.map((l) => [l.code, l.classe, l.communes])).toEqual([
      ['035000002', 3, ['Acigné', 'Vitré']],
      ['035000003', 2, ['Fougères']],
    ])
    expect(r.analyses).toBe(5)
  })
  it('pesticides : les non conformes au sens du bilan national, noms lisibles', () => {
    const r = reseauxFamilleAlpha(situ, index, dept, '35', 2025, 'pesticides')
    expect(r.lignes.map((l) => [l.code, l.nom])).toEqual([['035000001', 'Rennes Nord']])
  })
  it('un autre département n’est jamais compté', () => {
    expect(reseauxFamilleAlpha(situ, index, dept, '56', 2025, 'pesticides').lignes.map((l) => l.code)).toEqual(['056000001'])
  })
})

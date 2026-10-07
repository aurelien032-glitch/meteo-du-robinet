import { describe, expect, it } from 'vitest'
import { compteSituations, deptsDuService, phraseAgregat, reseauxDuService, routageService, tonAgregat, totauxReseaux } from './service'
import { renseigne } from './sispea'
import type { CommuneYearStats, DeptFile, ReseauInfo, SispeaServicesIndex } from './types'

const stats = (n: number, ncBact = 0): CommuneYearStats => ({ plv: [n, ncBact, n, 0, n, 0, 0], fam: {}, cle: {}, dep: [] })
const reseau = (nom: string, parAnnee: Record<string, CommuneYearStats> = {}): ReseauInfo => ({ nom, dist: null, uge: null, communes: [], stats: parAnnee })
function fichier(dept: string, reseaux: Record<string, ReseauInfo>, communes: Record<string, Record<string, string[]>>): DeptFile {
  return {
    dept,
    annees: [2024, 2025],
    reseaux,
    communes: Object.fromEntries(Object.entries(communes).map(([c, parAnnee]) => [c, { nom: c, reseaux: parAnnee, stats: {} }])),
  }
}

// Sur le modèle du SIECT : un réseau A dessert trois communes du service, un réseau B deux (dont une aussi
// desservie par A) ; une commune du service est dans le département voisin, desservie par un réseau C.
const f31 = fichier(
  '31',
  {
    '031000100': reseau('A', { '2025': stats(40, 1) }),
    '031000101': reseau('B', { '2025': stats(10) }),
    '031000200': reseau('D', { '2024': stats(7) }),
    '031000300': reseau('E'),
  },
  {
    '31001': { '2025': ['031000100'] },
    '31002': { '2025': ['031000100', '031000101'] },
    '31003': { '2025': ['031000100'], '2024': ['031000200'] },
    '31004': { '2025': ['031000101', '031000300'] },
  },
)
const f32 = fichier('32', { '032000001': reseau('C', { '2025': stats(5) }) }, { '32001': { '2025': ['032000001'] } })
const communes = ['31001', '31002', '31003', '31004', '32001']

describe('fiche service : prélèvements comptés par réseau', () => {
  it('compte chaque réseau une fois, quel que soit le nombre de ses communes dans le service', () => {
    const r = reseauxDuService(communes.slice(0, 4), [f31], '2025')
    // Somme commune par commune (l'ancien calcul) : 40 + (40 + 10) + 40 + 10 = 140 prélèvements, dont 3 non conformes.
    const t = totauxReseaux(r, '2025')
    expect(t.plv).toBe(50)
    expect(t.ncBact).toBe(1)
    expect(t.neBact).toBe(50)
  })

  it('garde, pour chaque réseau, les communes du service qu’il dessert', () => {
    const r = reseauxDuService(communes.slice(0, 4), [f31], '2025')
    expect(Object.fromEntries(r.map((x) => [x.info.nom, x.communes]))).toEqual({
      A: ['31001', '31002', '31003'],
      B: ['31002', '31004'],
      E: ['31004'],
    })
  })

  it('réunit les réseaux des communes situées dans un autre département', () => {
    const r = reseauxDuService(communes, [f31, f32], '2025')
    expect(r.map((x) => x.code).sort()).toEqual(['031000100', '031000101', '031000300', '032000001'])
    expect(totauxReseaux(r, '2025').plv).toBe(55)
  })

  it('ne retient que les réseaux de l’année choisie', () => {
    expect(reseauxDuService(communes, [f31, f32], '2024').map((x) => x.info.nom)).toEqual(['D'])
    expect(totauxReseaux(reseauxDuService(communes, [f31, f32], '2024'), '2024').plv).toBe(7)
  })

  it('un réseau sans prélèvement dans l’année ne pèse pas dans les totaux', () => {
    const t = totauxReseaux(reseauxDuService(communes, [f31, f32], '2025'), '2025')
    expect(t.reseauxAvecPlv).toBe(3) // E n'a aucun prélèvement en 2025
  })

  it('charge les départements des communes du service, une fois chacun', () => {
    const deptDe = new Map([
      ['31001', '31'],
      ['31002', '31'],
      ['32001', '32'],
      ['2A004', '2A'],
    ])
    expect(deptsDuService(['32001', '31002', '31001', '2A004'], deptDe)).toEqual(['2A', '31', '32'])
    // Une commune absente de l'index des communes n'a pas de fichier départemental à charger.
    expect(deptsDuService(['97501'], deptDe)).toEqual([])
  })
})

describe('fiche service : où lire la fiche, jamais de chargement sans fin', () => {
  // Entrées réelles de sispea/services-index.json : avant le 27/09, 351134 (CA Privas Centre Ardèche) n'avait que des
  // null, et la page attendait un fichier qu'elle ne demandait jamais.
  const index: SispeaServicesIndex = {
    '77654': ['Collectivité Eau du Bassin Rennais (CEBR)', '35', 121480, 'Délégation', 'eau potable : 01-Rennes-St Jacques'],
    '351134': [null, null, null, null, null],
    '78272': [null, null, null, null, 'eau potable'],
  }
  it('lit le fichier du département que donne l’index', () =>
    expect(routageService(index, '77654')).toEqual({ etat: 'fichier', chemin: 'sispea/services/35.json' }))
  it('sans département, le dit au lieu d’attendre', () => {
    expect(routageService(index, '351134')).toEqual({ etat: 'sans-departement', nom: null })
    expect(routageService(index, '78272')).toEqual({ etat: 'sans-departement', nom: 'eau potable' })
  })
  it('attend l’index, puis reconnaît un service inconnu, méthodes d’Object comprises', () => {
    expect(routageService(null, '77654')).toEqual({ etat: 'attente' })
    for (const id of ['99999', 'constructor', '__proto__', 'toString']) expect(routageService(index, id)).toEqual({ etat: 'inconnu' })
  })
})

describe('fiche service : champs SISPEA non renseignés', () => {
  it('écarte le point que la SISPEA met faute d’exploitant, et toute valeur sans lettre ni chiffre', () => {
    for (const v of ['.', ' . ', '', '   ', '-', '...', '–', null, undefined]) expect(renseigne(v)).toBeNull()
  })
  it('garde les vraies valeurs, sigles courts compris', () => {
    expect(renseigne('VEOLIA')).toBe('VEOLIA')
    expect(renseigne(' SEM ')).toBe('SEM')
    expect(renseigne('Régie')).toBe('Régie')
    expect(renseigne('"Régie des Eaux DLVAgglo"')).toBe('"Régie des Eaux DLVAgglo"')
  })
})

describe('fiche service : agrégat des réseaux, en une phrase', () => {
  it('compte les réseaux analysés, non conformes et sous restriction ou consigne', () =>
    expect(compteSituations(['00000', '20000', '00030', undefined, '-----'])).toEqual({ n: 3, nc: 2, restr: 1 }))
  it('PFAS : un dépassement est une non-conformité (limite applicable depuis 2023)', () =>
    expect(compteSituations(['00100', '00000'])).toEqual({ n: 2, nc: 1, restr: 0 }))
  it('écrit l’agrégat en une phrase accordée', () => {
    expect(phraseAgregat({ n: 7, nc: 2, restr: 2 })).toBe('2 réseaux non conformes sur 7, dont 2 sous restriction ou consigne')
    expect(phraseAgregat({ n: 23, nc: 1, restr: 0 })).toBe('1 réseau non conforme sur 23')
    expect(phraseAgregat({ n: 23, nc: 0, restr: 0 })).toBe('Les 23 réseaux analysés sont conformes aux limites réglementaires')
    expect(phraseAgregat({ n: 1, nc: 0, restr: 0 })).toBe('Le réseau analysé est conforme aux limites réglementaires')
    expect(phraseAgregat({ n: 1, nc: 1, restr: 1 })).toBe('Le réseau analysé est sous restriction ou consigne')
    expect(phraseAgregat({ n: 0, nc: 0, restr: 0 })).toBe('Aucun réseau analysé')
  })
})

describe('tonAgregat : le voyant d’un agrégat est celui du réseau le plus défavorable (04/10)', () => {
  it('restriction, sinon non conforme, sinon conforme ; rien sans réseau analysé', () => {
    expect(tonAgregat({ n: 12, nc: 3, restr: 1 })).toBe('bad')
    expect(tonAgregat({ n: 12, nc: 3, restr: 0 })).toBe('warn')
    expect(tonAgregat({ n: 12, nc: 0, restr: 0 })).toBe('good')
    expect(tonAgregat({ n: 0, nc: 0, restr: 0 })).toBeNull()
  })
})

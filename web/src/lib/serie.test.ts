import { describe, expect, it } from 'vitest'
import { echelleSerie, nomMois, parametreSerie, parametresMesures, phraseSerie, resumeSerie, serieAnnee, serieReseaux } from './serie'
import type { CommuneYearStats, SeriesDeptFile } from './types'

const stats = (dep: CommuneYearStats['dep']): CommuneYearStats => ({ plv: [0, 0, 0, 0, 0, 0, 0], fam: {}, cle: {}, dep })
const ligne = (code: string, n: number, nd: number, max: number): CommuneYearStats['dep'][number] => [code, n, nd, 0, n, max, null, null, null]

describe('parametreSerie', () => {
  it('Rennes (02000) : les nitrates, en réserve entre 40 et 50 mg/L', () => {
    expect(parametreSerie('02000', stats([]))).toEqual({ famille: 'azote', parametre: '1340' })
  })
  it('ASSELINERIE (01200) : les PFAS en restriction passent avant les nitrates en réserve', () => {
    expect(parametreSerie('01200', stats([ligne('8847', 42, 15, 0.459)]))).toEqual({ famille: 'pfas', parametre: '8847' })
  })
  it('Reims (22010) : le total des pesticides, qui a lui-même dépassé sa limite', () => {
    const reims = stats([ligne('6378', 18, 17, 1.13), ligne('6276', 18, 8, 1.409), ligne('6379', 18, 4, 0.222)])
    expect(parametreSerie('22010', reims)).toEqual({ famille: 'pesticides', parametre: '6276' })
  })
  it('Witry-lès-Reims (12010) : un métabolite seul en cause, pas de série des pesticides ; les nitrates à la place', () => {
    expect(parametreSerie('12010', stats([ligne('6378', 3, 1, 0.153)]))).toEqual({ famille: 'azote', parametre: '1340' })
  })
  it('Fonsorbes (0--30), réseau conforme partout, sans code : pas de série', () => {
    expect(parametreSerie('0--30', stats([ligne('1449', 168, 1, 2)]))).toBeNull()
    expect(parametreSerie('00000', stats([]))).toBeNull()
    expect(parametreSerie(null, undefined)).toBeNull()
  })
  it('à gravité égale, l’ordre du bulletin : nitrates au-dessus de 50 avant PFAS en dépassement', () => {
    expect(parametreSerie('03100', stats([]))).toEqual({ famille: 'azote', parametre: '1340' })
  })
})

// Séries 2025 publiées (series/dept/50.json et 35.json), réduites à deux mois de 2024 et à l'année 2025.
const MOIS = ['2024-11', '2024-12', ...Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)]
const FICHIER: SeriesDeptFile = {
  mois: MOIS,
  params: ['1340', '8847'],
  reseaux: {
    '050000645': {
      '8847': {
        n: [3, 1, 0, 1, 2, 2, 2, 2, 2, 2, 6, 12, 8, 3],
        nd: [0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0],
        nq: [3, 1, 0, 1, 2, 2, 2, 2, 2, 2, 6, 5, 4, 2],
        max: [0.05, 0.04, null, 0.261, 0.459, 0.351, 0.316, 0.261, 0.227, 0.222, 0.256, 0.004, 0.004, 0.003],
      },
    },
    '035004230': {
      '1340': {
        n: [30, 30, 39, 36, 33, 37, 33, 36, 41, 41, 40, 41, 39, 38],
        nd: Array(14).fill(0),
        nq: [30, 30, 39, 36, 33, 37, 33, 36, 41, 41, 40, 41, 39, 38],
        max: [28, 29, 42.1, 41.8, 41.7, 40.7, 39.6, 36.6, 33.8, 45.9, 30.5, 37, 26.7, 30.3],
      },
    },
  },
}

describe('serieAnnee et resumeSerie', () => {
  it('ASSELINERIE 2025 : 15 analyses sur 42 au-dessus de la limite, de février à septembre, maximum en mars', () => {
    const serie = serieAnnee(FICHIER, '050000645', '8847', 2025)!
    expect(serie).toHaveLength(12)
    expect(serie[0]).toEqual({ mois: '2025-01', max: null, analyses: 0, depassements: 0 })
    const r = resumeSerie(serie)
    expect(r).toEqual({ analyses: 42, depassements: 15, moisAvecDepassement: 8, maximum: 0.459, moisDuMaximum: '2025-03' })
    expect(serie.filter((x) => x.depassements).map((x) => nomMois(x.mois))).toEqual(['février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre'])
  })
  it('Rennes 2025 : le maximum de l’année, 45,9 mg/L en août, est celui qui fait la classe', () => {
    const r = resumeSerie(serieAnnee(FICHIER, '035004230', '1340', '2025')!)
    expect([r.maximum, nomMois(r.moisDuMaximum!), r.analyses, r.depassements]).toEqual([45.9, 'août', 454, 0])
  })
  it('null pour un réseau, un paramètre ou une année absents', () => {
    expect(serieAnnee(FICHIER, '050000645', '1340', 2025)).toBeNull()
    expect(serieAnnee(FICHIER, '099999999', '8847', 2025)).toBeNull()
    expect(serieAnnee(FICHIER, '050000645', '8847', 2023)).toBeNull()
  })
})

describe('séries de plusieurs réseaux et échelles', () => {
  it('petits multiples : maximum du mois sur l’ensemble, comptes additionnés', () => {
    const deux: SeriesDeptFile = {
      ...FICHIER,
      reseaux: { ...FICHIER.reseaux, '050000558': { '8847': { n: Array(14).fill(1), nd: Array(14).fill(0), nq: Array(14).fill(1), max: Array(14).fill(0.3) } } },
    }
    const s = serieReseaux(deux, ['050000645', '050000558'], '8847', 2025)!
    expect(s.map((m) => m.max)).toEqual([0.3, 0.3, 0.459, 0.351, 0.316, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3])
    expect(resumeSerie(s)).toMatchObject({ analyses: 54, depassements: 15 })
    expect(serieReseaux(deux, ['099999999'], '8847', 2025)).toBeNull()
    expect(parametresMesures(FICHIER, ['050000645'], 2025)).toEqual(['8847'])
    expect(parametresMesures(FICHIER, ['050000645', '035004230'], 2025)).toEqual(['1340', '8847'])
  })
  it('échelle : la limite toujours visible, graduations rondes', () => {
    expect(echelleSerie(45.9, 50)).toEqual({ haut: 60, graduations: [20, 40, 60] })
    expect(echelleSerie(0.459, 0.1)).toEqual({ haut: 0.6, graduations: [0.2, 0.4, 0.6] })
    expect(echelleSerie(1.409, 0.5)).toEqual({ haut: 2, graduations: [0.5, 1, 1.5, 2] })
    expect(echelleSerie(0.004, 0.1)).toEqual({ haut: 0.15, graduations: [0.05, 0.1, 0.15] })
    expect(echelleSerie(null, null)).toEqual({ haut: 1, graduations: [0.25, 0.5, 0.75, 1] })
  })
})

describe('phraseSerie', () => {
  const ESPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
  const net = (s: string) => s.replace(ESPACES, ' ')
  it('ASSELINERIE et Rennes en 2025 ; une année sans analyse', () => {
    expect(net(phraseSerie(serieAnnee(FICHIER, '050000645', '8847', 2025)!, 2025, 'µg/L'))).toBe(
      '42 analyses en 2025, dont 15 au-dessus de la limite, sur 8 mois ; maximum 0,459 µg/L en mars.',
    )
    expect(net(phraseSerie(serieAnnee(FICHIER, '035004230', '1340', 2025)!, 2025, 'mg/L'))).toBe('454 analyses en 2025, aucune au-dessus de la limite ; maximum 45,9 mg/L en août.')
    expect(phraseSerie([{ mois: '2025-01', max: null, analyses: 0, depassements: 0 }], 2025, 'mg/L')).toBe('Aucune analyse en 2025.')
  })
})

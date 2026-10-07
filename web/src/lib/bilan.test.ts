import { afterEach, describe, expect, it } from 'vitest'
import { eauDeClasse, ligneBilan, lettrePourquoi, lettresDistinctes, phraseBilan, pireLettre, pourquoi, titrePourquoi, urlInfofacture } from './bilan'
import type { ReseauBulletin } from './bulletin'
import { fmt } from './data'
import { classeArs, declarerPartiels, type SituationsFile } from './situations'
import type { CommuneYearStats, ParamInfo } from './types'

// Codes et classes réels de 2025 (situations/2025.json) : Saint-Quentin (02691) et Rennes (35238).
const SITU = {
  familles: [],
  reseaux: { '002001708': '220000', '002001716': '230000', '035004230': '020000', '099000001': '---0--', '099000002': '0-0000' },
  classes: { '002001708': 'CAAAAA', '002001716': 'CCAAAA', '099000001': '---a--', '099000002': 'Ab----' },
  depts: {},
  national: {},
} as unknown as SituationsFile
const reseau = (code: string, nom: string): ReseauBulletin => ({ code, nom, situation: SITU.reseaux[code] ?? null, ars: classeArs(SITU, code) })
const HAUT = reseau('002001708', 'Haut service')
const BAS = reseau('002001716', 'Bas service')
const RENNES = reseau('035004230', 'CEBR Villejean/Rophemel/Mezieres/Ava Rennes')

afterEach(() => declarerPartiels([]))

describe('bilan : lettre et cause courte de chaque réseau', () => {
  it('lettre au-delà de A : les familles qui la font, avec le libellé de leur classe', () => {
    expect(ligneBilan(HAUT, 2025)).toEqual({ code: '002001708', nom: 'Haut service', lettre: 'C', cause: 'Pesticides : dépassements plus de 30 jours.' })
    expect(ligneBilan(BAS, 2025).cause).toBe('Pesticides : dépassements plus de 30 jours ; Nitrates : au-dessus de 50 mg/L au moins une fois.')
  })
  it('classe A : les réserves nommées, jamais « conforme toute l’année » quand une classe intermédiaire existe', () => {
    expect(ligneBilan(RENNES, 2025)).toMatchObject({ lettre: 'A', cause: 'Conforme aux limites de qualité prises en compte, avec une réserve : nitrates, maximum de 40 à 50 mg/L.' })
    expect(ligneBilan({ code: 'x', nom: 'X', situation: '000000', ars: classeArs({ ...SITU, reseaux: { x: '000000' } }, 'x') }, 2025).cause).toBe(
      'Conforme aux limites de qualité prises en compte par la note.',
    )
  })
  it('lettre reportée : d’après les résultats des années précédentes', () => {
    const r = reseau('099000002', 'X')
    // Classe B reprise d'une année antérieure pour les nitrates (minuscule), famille non analysée en 2025.
    expect(r.ars?.reportees).toEqual(['azote'])
    expect(ligneBilan({ ...r, situation: '0-0000' }, 2025)).toMatchObject({ lettre: 'B', cause: 'Nitrates : d’après les résultats des années précédentes.' })
  })
  it('réseau non classé ou non analysé : le dire', () => {
    expect(ligneBilan({ code: 'z', nom: 'Z', situation: null }, 2025)).toMatchObject({ lettre: null, cause: 'Aucune analyse rattachée à ce réseau en 2025 ; pas de note.' })
    expect(ligneBilan({ code: 'z', nom: 'Z', situation: '000000' }, 2025)).toMatchObject({ lettre: null, cause: 'Pas de note en 2025.' })
  })
  it('lettre la plus défavorable, lettres distinctes, libellé de l’indicateur marqué', () => {
    expect(pireLettre([RENNES, HAUT])).toBe('C')
    expect(pireLettre([{ ars: null }])).toBeNull()
    expect(lettresDistinctes([HAUT, RENNES, BAS])).toEqual(['A', 'C'])
    expect(eauDeClasse('C')).toBe('Eau de qualité insuffisante*')
  })
  it('« note calculée par le site », la synthèse de l’ARS fait foi et peut différer', () => {
    expect(phraseBilan(true)).toBe(
      'Note de chaque réseau calculée par le site à partir des analyses publiques, selon la méthode de l’indicateur de l’ARS. La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi et peut différer.',
    )
    expect(phraseBilan(false)).toMatch(/^Note calculée par le site/)
  })
  it('synthèse officielle de l’ARS : une année close seulement', () => {
    expect(urlInfofacture('002001708', 2025)).toBe('https://carto.atlasante.fr/IHM/cartes/infofactures/AQUASISED/2025/INFOFACTURE-002001708-2025.pdf')
    declarerPartiels([2026])
    expect(urlInfofacture('002001708', 2026)).toBeNull()
  })
})

describe('« Pourquoi la classe »', () => {
  const PARAMS: Record<string, ParamInfo> = {
    '6276': { l: 'Total des pesticides analysés', u: 'µg/L', lim: '<=0,5 µg/L', ref: null, f: 'pesticides', n: 0, nd: 0, nr: 0, nq: 0, a: [], k: 'Total pesticides' },
    '6378': { l: 'Chloridazone desphényl', u: 'µg/L', lim: '<=0,1 µg/L', ref: null, f: 'pesticides', n: 0, nd: 0, nr: 0, nq: 0, a: [], k: null },
    '1382': { l: 'Plomb', u: 'µg/L', lim: '<=10 µg/L', ref: null, f: 'metaux_mineraux', n: 0, nd: 0, nr: 0, nq: 0, a: [], k: 'Plomb' },
    '1340': { l: 'Nitrates (en NO3)', u: 'mg/L', lim: '<=50 mg/L', ref: null, f: 'azote', n: 0, nd: 0, nr: 0, nq: 0, a: [], k: 'Nitrates' },
  }
  // Statistiques réelles 2025 des deux réseaux (dept/02.json), plomb ajouté au bas service pour la règle des canalisations.
  const statsHaut = {
    plv: [82, 0, 76, 4, 82, 0, 2],
    fam: {},
    cle: { '1340': [77, 0, 0, 77, 50, 43.4, 40.9, '2025-12-18'] },
    dep: [['6276', 4, 4, 0, 4, 2.874, 2.7, 2.8, '2025-12-09'], ['6378', 4, 4, 0, 4, 2.207, 2.0, 2.1, '2025-12-09']],
  } as unknown as CommuneYearStats
  const statsBas = {
    plv: [52, 0, 47, 5, 52, 1, 3],
    fam: {},
    cle: { '1340': [47, 2, 0, 47, 50.1, 42.2, 47.1, '2025-12-09'] },
    dep: [['6276', 3, 3, 0, 3, 3.503, 3.0, 3.5, '2025-11-18'], ['1340', 47, 2, 0, 47, 50.1, 42.2, 47.1, '2025-12-09'], ['1382', 2, 1, 0, 2, 14, 7, 0, '2025-05-02']],
  } as unknown as CommuneYearStats
  const familles = pourquoi([{ ...BAS, stats: statsBas }, { ...HAUT, stats: statsHaut }], PARAMS, '2025')

  it('familles en cause, la plus grave d’abord ; réserve comprise ; paramètres des canalisations écartés', () => {
    expect(familles.map((f) => [f.famille, f.lettre])).toEqual([
      ['pesticides', 'C'],
      ['azote', 'C'],
    ])
    expect(familles.some((f) => f.famille === 'metaux_mineraux')).toBe(false)
  })
  it('une phrase factuelle par paramètre : analyses au-dessus sur le total, maximum, limite, réseaux', () => {
    expect(familles[0].phrases).toEqual([
      `Total des pesticides analysés : 7 analyses au-dessus de la limite de qualité de ${fmt.sig(0.5)} µg/L sur 7, maximum ${fmt.sig(3.503)} µg/L (réseaux Bas service et Haut service).`,
      `Chloridazone desphényl : 4 analyses au-dessus de la limite de qualité de ${fmt.sig(0.1)} µg/L sur 4, maximum ${fmt.sig(2.207)} µg/L (réseau Haut service).`,
    ])
    // Jauge : le paramètre clé de la famille, sa valeur maximale face au repère de la limite.
    expect(familles[0].jauge?.nom).toBe('Total des pesticides analysés')
    expect(familles[0].jauge?.reglette).toMatchObject({ limite: 0.5, valeur: 3.503 })
  })
  it('nitrates : maximum de chaque réseau, écrit sans franchir la limite ; la réserve du haut service comprise', () => {
    expect(familles[1].phrases).toEqual([
      'Bas service : concentration maximale de 50,1 mg/L en 2025, pour une limite de qualité de 50 mg/L.',
      'Haut service : concentration maximale de 50,0 mg/L en 2025, pour une limite de qualité de 50 mg/L.',
    ])
    expect(familles[1].jauge?.reglette.valeur).toBe(50.1)
  })
  it('un seul réseau : la phrase seule, capitale initiale ; titre des réserves de la classe A', () => {
    const rennes = pourquoi([{ ...RENNES, stats: { ...statsHaut, cle: { '1340': [400, 0, 0, 400, 45.9, 30, 30, '2025-12-01'] } } as unknown as CommuneYearStats }], PARAMS, '2025')
    expect(rennes.map((f) => [f.famille, f.lettre])).toEqual([['azote', null]])
    expect(rennes[0].phrases).toEqual(['Concentration maximale de 45,9 mg/L en 2025, pour une limite de qualité de 50 mg/L.'])
    expect(lettrePourquoi([RENNES], rennes)).toBe('A')
    expect(titrePourquoi('A')).toBe('Les réserves de la note A')
    expect(titrePourquoi('C')).toBe('Pourquoi la note C')
    expect(lettrePourquoi([RENNES], [])).toBeNull()
  })
  it('famille reportée : aucune analyse dans l’année, la classe reprend les années précédentes', () => {
    const r = pourquoi([{ ...reseau('099000002', 'X'), stats: undefined }], PARAMS, '2025')
    expect(r[0].phrases[0]).toBe('Aucune analyse de cette famille en 2025 ; la note reprend les résultats des années précédentes, cinq ans au plus.')
  })
  it('jamais d’origine supposée ni de jugement sanitaire', () => {
    const texte = JSON.stringify(familles)
    expect(texte).not.toMatch(/herbicide|agricult|interdit|dangereu|potable|boire/i)
  })
})

describe('note bactériologique (grille de l’ARS) et PFAS non confirmés (2026-10-05)', () => {
  const S = {
    ...SITU,
    reseaux: { b1: '000300', b2: '000100', p1: '001000', m1: '000200' },
    classes: { b1: 'AAADAA', b2: 'AAACAA' },
    bact: { b1: [16, 2, 3, 2024], b2: [62, 1, 80, 2025] },
  } as unknown as SituationsFile
  const r = (code: string) => ({ code, nom: code, situation: S.reseaux[code], ars: classeArs(S, code) }) as ReseauBulletin
  it('cause d’une note bactériologique : prélèvements cumulés, période, maximum à partir de 5 germes', () => {
    expect(ligneBilan(r('b1'), 2025).cause).toBe('Bactériologie : 87,5 % de prélèvements conformes sur 16, de 2024 à 2025.')
    expect(ligneBilan(r('b2'), 2025).cause).toBe('Bactériologie : 98,4 % de prélèvements conformes sur 62, en 2025, jusqu’à 80 E. coli ou entérocoques pour 100 mL.')
  })
  it('note A malgré un dépassement au bulletin : ce que la note ne retient pas', () => {
    expect(ligneBilan(r('p1'), 2025).cause).toBe(
      'Conforme aux limites de qualité prises en compte par la note. La note ne retient pas un dépassement isolé de la limite des PFAS, non confirmé dans l’année.',
    )
    expect(ligneBilan(r('m1'), 2025).cause).toMatch(/ne retient pas les prélèvements bactériologiques non conformes, en deçà des seuils de la grille/)
  })
})

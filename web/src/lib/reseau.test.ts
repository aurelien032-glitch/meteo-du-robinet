import { describe, expect, it } from 'vitest'
import { communesDuReseau, servicesDesCommunes } from './reseau'
import type { CommuneDetail, DeptFile, SispeaCommuneYear, SispeaDeptFile } from './types'

const commune = (nom: string, reseaux: Record<string, string[]>): CommuneDetail => ({ nom, reseaux, stats: {} })
// Réseau 035004230 (Rennes et Saint-Jacques-de-la-Lande en 2025), et une commune qu'il ne dessert plus.
const DEPT: DeptFile = {
  dept: '35',
  annees: [2024, 2025],
  reseaux: { '035004230': { nom: 'CEBR_VILLEJEAN', dist: 'SPL EBR', uge: null, communes: ['35238', '35281', '35999'] } },
  communes: {
    '35238': commune('RENNES', { '2024': ['035004230'], '2025': ['035004230'] }),
    '35281': commune('SAINT-JACQUES-DE-LA-LANDE', { '2025': ['035004230', '035000466'] }),
    '35999': commune('ANCIENNE', { '2024': ['035004230'], '2025': ['035000999'] }),
  },
}

const d = (id: string, coll: string, prix: number | null): SispeaCommuneYear => ({
  id,
  nom: 'eau potable',
  coll,
  mode: 'Délégation',
  op: null,
  pop: null,
  pop_com: null,
  secteur: null,
  statut: null,
  ind: prix == null ? {} : { 'D102.0': prix },
})
const SISPEA: SispeaDeptFile = {
  '35238': { '2024': d('77654', 'Collectivité Eau du Bassin Rennais (CEBR)', 2.72) },
  '35281': { '2024': d('77654', 'Collectivité Eau du Bassin Rennais (CEBR)', 2.72) },
  '35999': { '2024': d('11111', 'Autre syndicat', 2.1) },
}

describe('fiche réseau : ce que dessert le réseau', () => {
  it('communes desservies l’année choisie, pas celles d’autres années', () => {
    expect(communesDuReseau(DEPT, '035004230', '2025')).toEqual(['35238', '35281'])
    expect(communesDuReseau(DEPT, '035004230', '2024')).toEqual(['35238', '35999'])
    expect(communesDuReseau(DEPT, '035004230', '2023')).toEqual([])
    expect(communesDuReseau(DEPT, '099999999', '2025')).toEqual([])
  })
  it('services de ces communes, chacun une fois, par nom', () => {
    expect(servicesDesCommunes(SISPEA, ['35238', '35281']).map((s) => [s.id, s.nom])).toEqual([['77654', 'Collectivité Eau du Bassin Rennais (CEBR)']])
    expect(servicesDesCommunes(SISPEA, ['35999', '35238', '35000']).map((s) => s.id)).toEqual(['11111', '77654'])
    expect(servicesDesCommunes(null, ['35238'])).toEqual([])
  })
})

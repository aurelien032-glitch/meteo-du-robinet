import { describe, expect, it } from 'vitest'
import { modeGestion, renseigne, serviceDeCommune } from './sispea'
import type { SispeaCommuneYear, SispeaDeptFile } from './types'

// Déclarations réelles de Rennes à la SISPEA (sispea/dept/35.json), réduites aux champs lus.
const d = (id: string, coll: string, nom: string, mode: string, op: string | null, prix: number | null, statut: string): SispeaCommuneYear => ({
  id,
  coll,
  nom,
  mode,
  op,
  pop: null,
  pop_com: null,
  secteur: null,
  statut,
  ind: prix == null ? {} : { 'D102.0': prix },
})
const RENNES: SispeaDeptFile = {
  '35238': {
    '2022': d('77654', 'Collectivite Eau du Bassin Rennais (CEBR)', 'eau potable : 01-Rennes', 'Delegation', '.', 2.61, 'Confirmé / publié'),
    '2024': d('77654', 'Collectivité Eau du Bassin Rennais (CEBR)', 'eau potable : 01-Rennes-St Jacques', 'Délégation', null, 2.72, 'Publié non vérifié'),
    '2025': d('77654', 'Collectivité Eau du Bassin Rennais (CEBR)', 'eau potable : 01-Rennes-St Jacques', 'Délégation', null, null, 'En attente de saisie'),
  },
}

describe('service d’une commune', () => {
  it('Rennes : la dernière déclaration qui publie un prix, pas la saisie en cours', () => {
    expect(serviceDeCommune(RENNES, '35238')).toEqual({
      id: '77654',
      nom: 'Collectivité Eau du Bassin Rennais (CEBR)',
      entite: '01-Rennes-St Jacques',
      mode: 'délégation',
      exploitant: null,
      prix: 2.72,
      annee: '2024',
    })
  })
  it('sans prix publié, la dernière déclaration ; commune absente : null', () => {
    const sansPrix: SispeaDeptFile = { '1': { '2025': d('9', '.', 'eau potable : Service', 'Regie', 'SAUR', null, 'En cours de saisie') } }
    expect(serviceDeCommune(sansPrix, '1')).toMatchObject({ nom: 'eau potable : Service', entite: null, mode: 'régie', exploitant: 'SAUR', prix: null, annee: '2025' })
    const seul: SispeaDeptFile = { '2': { '2024': d('8', 'SIECT', 'eau potable', 'Régie', null, 2.56, 'Publié non vérifié') } }
    expect(serviceDeCommune(seul, '2')).toMatchObject({ nom: 'SIECT', entite: null })
    expect(serviceDeCommune(RENNES, '35051')).toBeNull()
    expect(serviceDeCommune(null, '35238')).toBeNull()
  })
  it('mode de gestion comme le pipeline (GESTION_SQL)', () => {
    expect(['Régie', 'Regie avec prestation de service', 'DELEGATION', 'Délégation', '.', null, 'Mixte'].map(modeGestion)).toEqual([
      'régie',
      'régie',
      'délégation',
      'délégation',
      null,
      null,
      null,
    ])
    expect([renseigne('.'), renseigne(' SAUR ')]).toEqual([null, 'SAUR'])
  })
})

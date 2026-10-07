import { describe, expect, it } from 'vitest'
import { lireServices } from './servicesCommunes'
import { communeDeRattachement, type SispeaCommunesFile } from './types'

const COLONNES = ['nom', 'entite', 'mode', 'prix', 'rend', 'renouv', 'protection', 'conso', 'pertes']

const fichier: SispeaCommunesFile = {
  annee: '2024',
  colonnes: COLONNES,
  services: {
    '77654': ['Collectivité Eau du Bassin Rennais (CEBR)', '01-Rennes-St Jacques', 'd', 2.72, 93.3, 0.87, 100, 123, 6.7],
    '100': ['SIAEP du Sud', null, 'r', 2.1, 71.5, 0.2, 60, 150, 28.5],
    '101': ['Petite commune', null, 'r', 2.1, null, null, null, null, null],
    '102': [null, null, null, null, null, null, null, null, null],
    '200': ['Ajaccio', null, 'd', 3.1, 80, 0.5, 90, 180, 20],
    '300': ['Paris', null, 'r', 2.03, 90.9, 0.86, 80, 198, 9.1],
  },
  communes: { '35238': '77654', '35047': '77654', '35001': '100', '35002': '101', '35003': '102', '2A004': '200', '75056': '300' },
}

describe('vue communale des services d’eau sur /carte', () => {
  const lecture = lireServices(fichier)

  it('chaque commune prend la valeur de son service ; le mode de gestion vaut 0 ou 1', () => {
    expect(lecture.valeur('35238', 'prix')).toBe(2.72)
    expect(lecture.valeur('35047', 'pertes')).toBe(6.7)
    expect(lecture.valeur('35238', 'mode')).toBe(1)
    expect(lecture.valeur('35001', 'mode')).toBe(0)
    expect(lecture.valeur('35003', 'mode')).toBeNull()
    expect(lecture.valeur('35002', 'rend')).toBeNull()
    expect(lecture.valeur('99999', 'prix')).toBeNull() // commune absente de l’observatoire
  })

  it('les arrondissements de Paris, Marseille et Lyon prennent le service de leur commune', () => {
    expect(['75101', '75120', '13201', '13216', '69381', '69389', '75056', '75121', '13217', '69380'].map(communeDeRattachement)).toEqual([
      '75056', '75056', '13055', '13055', '69123', '69123', '75056', '75121', '13217', '69380',
    ])
    expect(lecture.valeur('75108', 'prix')).toBe(2.03)
    expect(lecture.service('75108')?.nom).toBe('Paris')
    // Paris n'est compté qu'une fois dans la liste de son département.
    expect(lecture.servicesDuDepartement('75', 'prix', 'haut').lignes.map((l) => [l.service.nom, l.communes])).toEqual([['Paris', 1]])
  })

  it('le service d’une commune, nommé même quand la SISPEA ne le nomme pas', () => {
    expect(lecture.service('35238')).toEqual({ id: '77654', nom: 'Collectivité Eau du Bassin Rennais (CEBR)', entite: '01-Rennes-St Jacques', mode: 'délégation' })
    expect(lecture.service('35003')).toEqual({ id: '102', nom: 'Service non nommé', entite: null, mode: null })
    expect(lecture.service('99999')).toBeNull()
  })

  it('les services d’un département, rangés comme le classement départemental', () => {
    const prix = lecture.servicesDuDepartement('35', 'prix', 'haut')
    // À valeur et territoire égaux, l’ordre alphabétique : « Petite commune » avant « SIAEP du Sud ».
    expect(prix.lignes.map((l) => [l.service.id, l.v, l.communes])).toEqual([
      ['77654', 2.72, 2],
      ['101', 2.1, 1],
      ['100', 2.1, 1],
    ])
    expect(prix.sansValeur).toBe(1)
    // Rendement : le plus faible d’abord ; les services sans valeur sont comptés à part.
    const rend = lecture.servicesDuDepartement('35', 'rend', 'bas')
    expect(rend.lignes.map((l) => l.service.id)).toEqual(['100', '77654'])
    expect(rend.sansValeur).toBe(2)
    // Corse : 2A, pas « 2A » confondu avec un autre département.
    expect(lecture.servicesDuDepartement('2A', 'prix', 'haut').lignes.map((l) => l.service.nom)).toEqual(['Ajaccio'])
  })
})

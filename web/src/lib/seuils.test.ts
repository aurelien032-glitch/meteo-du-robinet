import { describe, expect, it } from 'vitest'
import pipeline from '../../../pipeline/robinet/situations.py?raw'
import {
  classeBacterio,
  classeNitrates,
  detailSituation,
  libellesCourts,
  libellesSituation,
  SEUIL_BACT,
  SEUIL_JOURS_PESTICIDES,
  SEUILS_NITRATES,
} from './situations'

/**
 * Les seuils des bilans officiels n'existent qu'une fois côté site (lib/situations.ts) et doivent rester ceux du
 * pipeline qui a classé les réseaux ; les libellés affichés en sont dérivés et ne doivent pas changer d'un mot.
 */
describe('seuils des bilans officiels', () => {
  it('sont ceux du pipeline (pipeline/robinet/situations.py)', () => {
    const nitrates = /CLASSES_NITRATES\s*=\s*\(([^)]*)\)/.exec(pipeline)?.[1].split(',').map((x) => Number(x.trim()))
    expect(nitrates).toEqual([...SEUILS_NITRATES])
    expect(Number(/SEUIL_BACT\s*=\s*([\d.]+)/.exec(pipeline)?.[1])).toBe(SEUIL_BACT)
    expect(Number(/SEUIL_JOURS\s*=\s*(\d+)/.exec(pipeline)?.[1])).toBe(SEUIL_JOURS_PESTICIDES)
  })

  it('classe nitrates : seuils strictement dépassés par le maximum de l’année', () => {
    expect([0, 25, 25.01, 40, 40.5, 45.9, 50, 50.01].map(classeNitrates)).toEqual([0, 0, 1, 1, 2, 2, 2, 3])
  })

  it('classe bactériologique : 100 % → 0, au moins 95 % → 1, en dessous → 2, rien d’évalué → null', () => {
    expect(classeBacterio(0, 456)).toBe(0)
    expect(classeBacterio(1, 379)).toBe(1) // Reims 2025, 99,7 %
    expect(classeBacterio(1, 20)).toBe(1) // 95 % pile
    expect(classeBacterio(1, 19)).toBe(2) // 94,7 %
    expect(classeBacterio(1, 3)).toBe(2) // petit réseau : un échec sur trois
    expect(classeBacterio(0, 0)).toBeNull()
  })
})

describe('libellés dérivés des seuils', () => {
  it('ne changent pas d’un mot', () => {
    expect(libellesSituation('pesticides')).toEqual(['conforme toute l’année', 'dépassements 30 jours au plus', 'dépassements plus de 30 jours', 'restriction de consommation'])
    expect(libellesSituation('azote')).toEqual(['maximum sous 25 mg/L', 'maximum de 25 à 40 mg/L', 'maximum de 40 à 50 mg/L', 'au-dessus de 50 mg/L au moins une fois'])
    expect(libellesSituation('microbio')).toEqual(['tous les prélèvements conformes', 'au moins 95 % de prélèvements conformes', 'moins de 95 % de prélèvements conformes', "consigne d'ébullition ou restriction"])
    expect(libellesCourts('pesticides')).toEqual(['conforme', '30 jours au plus', 'plus de 30 jours', 'restriction'])
    expect(libellesCourts('azote')).toEqual(['< 25 mg/L', '25 à 40 mg/L', '40 à 50 mg/L', '> 50 mg/L'])
    expect(libellesCourts('microbio')).toEqual(['100 % conformes', '≥ 95 %', '< 95 %', 'consigne'])
    expect(detailSituation('pesticides').titre).toBe('Plus de 30 jours ou restriction')
    expect(detailSituation('azote').titre).toBe('Entre 40 et 50 mg/L')
  })
})

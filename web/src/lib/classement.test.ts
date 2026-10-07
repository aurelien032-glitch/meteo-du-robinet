import { describe, expect, it } from 'vitest'
import { classable, EFFECTIF_MIN, reseauxParDept } from './classement'
import type { SituationsFile } from './situations'

describe('classements par part : effectif minimal', () => {
  it('écarte une part tirée de quelques réseaux, sauf si ce sont tous ceux du département', () => {
    expect(EFFECTIF_MIN).toBe(10)
    expect(classable(1, 369)).toBe(false) // Haute-Loire, radioactivité 2025
    expect(classable(2, 541)).toBe(false) // Aude, PFAS 2024
    expect(classable(4, 4)).toBe(true) // Paris : tous ses réseaux
    expect(classable(10, 541)).toBe(true)
    expect(classable(9)).toBe(false) // total inconnu (analyses d'un paramètre)
    expect(classable(0, 0)).toBe(false)
  })
  it('compte les réseaux de chaque département d’après leur code', () => {
    const situ = { familles: [], depts: {}, national: {}, reseaux: { '075000001': '0----0', '075000002': '1----0', '02A000010': '-0---0', '971000015': '00-300' } } as unknown as SituationsFile
    expect(Object.fromEntries(reseauxParDept(situ))).toEqual({ '75': 2, '2A': 1, '971': 1 })
    expect(reseauxParDept(null).size).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { libelleParametre } from './parametres'

describe('libellés lisibles des paramètres', () => {
  it('les libellés de laboratoire deviennent lisibles, les autres restent officiels', () => {
    expect(libelleParametre('1449', 'Escherichia coli /100ml - MF')).toBe('E. coli (bactérie d’origine fécale)')
    expect(libelleParametre('1295', 'Turbidité néphélométrique NFU')).toBe('Turbidité (eau trouble)')
    expect(libelleParametre('1340', 'Nitrates (en NO3)')).toBe('Nitrates')
    expect(libelleParametre('1221', 'Métolachlore')).toBe('Métolachlore')
    expect(libelleParametre('9999', null)).toBe('Paramètre 9999')
  })
})

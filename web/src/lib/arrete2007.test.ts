import { describe, expect, it } from 'vitest'
import { ecartsDuCode, SEUILS_ARRETE } from './arrete2007'
import { LIMITE_PFAS_DEFAUT, NON_PERTINENTS, SEUILS_NITRATES } from './situations'

const seuil = (parametre: string) => SEUILS_ARRETE.find((s) => s.parametre === parametre)

describe('seuils de l’arrêté du 11 janvier 2007 (annexe I)', () => {
  it('les seuils écrits dans lib/situations.ts sont ceux de l’arrêté', () => {
    expect(seuil('Nitrates')).toMatchObject({ type: 'limite', valeur: `${SEUILS_NITRATES[2]} mg/L` })
    expect(seuil('Somme des substances alkylées per et polyfluorées')?.valeur).toBe(`${String(LIMITE_PFAS_DEFAUT).replace('.', ',')}0 µg/L`)
    expect(seuil('Total pesticides')?.valeur).toBe('0,50 µg/L')
    expect(seuil('Pesticides (par substance individuelle)')?.valeur).toBe('0,10 µg/L')
  })
  it('la valeur indicative des métabolites non pertinents couvre la liste du site', () => {
    const vi = SEUILS_ARRETE.find((s) => s.type === 'valeur_indicative')
    expect(vi?.valeur).toBe('0,9 µg/L')
    for (const code of Object.keys(NON_PERTINENTS)) expect(vi?.codes).toContain(code)
  })
  it('chaque partie a ses seuils, les limites différées portent leur date', () => {
    for (const p of ['limites-microbio', 'limites-chimie', 'references', 'radioactivite', 'valeur-indicative', 'vigilance'])
      expect(SEUILS_ARRETE.some((s) => s.partie === p), p).toBe(true)
    expect(SEUILS_ARRETE.filter((s) => s.dateEffet).map((s) => s.parametre)).toEqual(['Chrome', 'Plomb'])
  })
  it('les écarts SISE / arrêté se retrouvent par code, en phrases publiques', () => {
    expect(ecartsDuCode('7097')[0]).toMatch(/trans-nonachlore/)
    expect(ecartsDuCode('1340')).toEqual([])
    for (const s of SEUILS_ARRETE) if (s.ecart) expect(s.ecart).not.toMatch(/params\.json|code SISE|CLATE|_T\b/)
  })
})

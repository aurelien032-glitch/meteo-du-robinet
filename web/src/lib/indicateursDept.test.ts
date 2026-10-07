import { describe, expect, it } from 'vitest'
import { GROUPES_DEPT, INDICS_DEPT, periodeLisible, type DonneesDept } from './indicateursDept'
import type { SispeaNationalFile } from './types'

/** Clés des indicateurs de l'eau du robinet sur /carte (pages/Carte.tsx, INDICS). */
const CLES_ROBINET = ['pesticides', 'azote', 'pfas', 'microbio', 'metaux', 'autres', 'any', 'restrictions', 'avis', 'bact', 'chim', 'param']

describe('indicateurs par département de /carte', () => {
  it('une clé par indicateur, qui ne recoupe aucune clé de l’eau du robinet', () => {
    const cles = INDICS_DEPT.map((i) => i.key)
    expect(new Set(cles).size).toBe(cles.length)
    expect(cles.filter((k) => CLES_ROBINET.includes(k))).toEqual([])
  })
  it('services d’eau, puis ressource et amont, sans les doublons de l’amont', () => {
    expect(GROUPES_DEPT.map((g) => INDICS_DEPT.filter((i) => i.groupe === g).length)).toEqual([4, 15])
    expect(INDICS_DEPT.some((i) => i.key === 'robinet' || i.key === 'sout')).toBe(false)
    expect(INDICS_DEPT.find((i) => i.key === 'nappes_nitrates')?.page.to).toBe('/amont?indic=nitrates')
  })
  it('chacun a un libellé de menu court, une page et une source', () => {
    for (const i of INDICS_DEPT) {
      expect(i.menu.length, i.key).toBeGreaterThan(0)
      expect(i.menu.length, i.key).toBeLessThanOrEqual(45)
      expect(i.page.to, i.key).toMatch(/^\/(services|ressource|amont)\?indic=/)
      expect(i.sourceTexte, i.key).toMatch(/^Source : /)
    }
  })
  it('périodes en toutes lettres : les mois écrits, les intervalles d’années intacts', () => {
    expect(periodeLisible('2026-08')).toBe('août 2026')
    expect(periodeLisible('12 mois à 2026-08')).toBe('12 mois à août 2026')
    expect(periodeLisible('2018-2023')).toBe('2018-2023')
    expect(periodeLisible('2021-2025')).toBe('2021-2025')
  })
  it('SISPEA : la valeur du millésime choisi, rien pour un millésime absent', () => {
    const rend = INDICS_DEPT.find((i) => i.key === 'rend')!
    const sispea = { depts: { '33': { '2024': { rend: { pond: 81.2 } } }, '40': { '2023': { rend: { pond: 77 } } } } } as unknown as SispeaNationalFile
    const d: DonneesDept = { sispea }
    expect([...rend.valeurs(d, '2024')]).toEqual([['33', 81.2]])
    expect(rend.periode(d, '2024')).toBe('2024')
    expect(rend.pire).toBe('bas')
  })
  it('vue communale pour les sept indicateurs tirés de la SISPEA, et pour eux seuls', () => {
    const avecCommunes = INDICS_DEPT.filter((i) => i.commune).map((i) => [i.key, i.commune!.col])
    expect(avecCommunes).toEqual([
      ['prix', 'prix'],
      ['rend', 'rend'],
      ['renouv', 'renouv'],
      ['delegation', 'mode'],
      ['pertes_pct', 'pertes'],
      ['conso_l_hab_j', 'conso'],
      ['protection_moy', 'protection'],
    ])
    // Le mode de gestion se lit en deux états, sans paliers ; consommation et fuites avertissent des valeurs extrêmes.
    expect(INDICS_DEPT.find((i) => i.key === 'delegation')!.commune!.binaire).toEqual(['régie', 'gestion déléguée'])
    expect(INDICS_DEPT.filter((i) => i.commune?.note).map((i) => i.key)).toEqual(['pertes_pct', 'conso_l_hab_j'])
    for (const i of INDICS_DEPT.filter((x) => x.commune)) expect(i.commune!.desc, i.key).toMatch(/le service qui dessert la commune|du service qui dessert la commune/)
  })
})

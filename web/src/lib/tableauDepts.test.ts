import { describe, expect, it } from 'vitest'
import { declarerPartiels } from './situations'
import { alphabetique, ariaTri, csvTableau, lignesCarte, nomFichierSujet, pctCsv, phraseTriSujet, TRI_ALPHABETIQUE, trierLignes, triApres, type CleTriable } from './tableauDepts'

interface L {
  dd: string
  nom: string
  part: number | null
  n: number
  ok: boolean
}
const lignes: L[] = [
  { dd: '75', nom: 'Paris', part: 0.5, n: 4, ok: true },
  { dd: '02', nom: 'Aisne', part: 0.2, n: 279, ok: true },
  { dd: '43', nom: 'Haute-Loire', part: 1, n: 1, ok: false },
  { dd: '2A', nom: 'Corse-du-Sud', part: null, n: 0, ok: false },
  { dd: '01', nom: 'Ain', part: 0.2, n: 234, ok: true },
  { dd: '971', nom: 'Guadeloupe', part: 0.3, n: 30, ok: true },
]
const colonnes: CleTriable<L>[] = [
  { cle: 'part', valeur: (l) => l.part, classable: (l) => l.ok },
  { cle: 'n', valeur: (l) => l.n },
]
const ordre = (l: L[]) => l.map((x) => x.nom)

describe('tri des tableaux de départements (aucun palmarès par défaut)', () => {
  it('ordre alphabétique par défaut, en français', () => {
    expect(ordre(trierLignes(lignes, TRI_ALPHABETIQUE, colonnes))).toEqual(['Ain', 'Aisne', 'Corse-du-Sud', 'Guadeloupe', 'Haute-Loire', 'Paris'])
    expect(ordre(alphabetique(lignes))).toEqual(['Ain', 'Aisne', 'Corse-du-Sud', 'Guadeloupe', 'Haute-Loire', 'Paris'])
    expect(ordre(trierLignes(lignes, { cle: 'nom', desc: true }, colonnes))[0]).toBe('Paris')
  })
  it('par part : les parts étayées d’abord, puis « hors tri », puis sans valeur ; à égalité, l’ordre alphabétique', () => {
    expect(ordre(trierLignes(lignes, { cle: 'part', desc: true }, colonnes))).toEqual(['Paris', 'Guadeloupe', 'Ain', 'Aisne', 'Haute-Loire', 'Corse-du-Sud'])
    expect(ordre(trierLignes(lignes, { cle: 'part', desc: false }, colonnes))).toEqual(['Ain', 'Aisne', 'Guadeloupe', 'Paris', 'Haute-Loire', 'Corse-du-Sud'])
  })
  it('par un compte : sans règle des classements', () => {
    expect(ordre(trierLignes(lignes, { cle: 'n', desc: true }, colonnes))).toEqual(['Aisne', 'Ain', 'Guadeloupe', 'Paris', 'Haute-Loire', 'Corse-du-Sud'])
  })
  it('clic : une colonne s’ouvre sur les plus fortes valeurs, un second clic inverse ; aria-sort', () => {
    expect(triApres(TRI_ALPHABETIQUE, 'part')).toEqual({ cle: 'part', desc: true })
    expect(triApres({ cle: 'part', desc: true }, 'part')).toEqual({ cle: 'part', desc: false })
    expect(triApres({ cle: 'part', desc: true }, 'nom')).toEqual({ cle: 'nom', desc: false })
    expect(ariaTri({ cle: 'part', desc: true }, 'part')).toBe('descending')
    expect(ariaTri({ cle: 'part', desc: true }, 'nom')).toBe('none')
  })
  it('phrase d’état du tri, la règle des classements dite pour une part', () => {
    expect(phraseTriSujet(TRI_ALPHABETIQUE, 'x', false)).toBe('Départements dans l’ordre alphabétique.')
    expect(phraseTriSujet({ cle: 'part', desc: true }, 'la part des réseaux non conformes', true)).toBe(
      'Départements triés par la part des réseaux non conformes, de la plus forte à la plus faible. Les parts calculées sur moins de 10 réseaux analysés sont placées en fin de liste.',
    )
    expect(phraseTriSujet({ cle: 'n', desc: false }, 'le nombre d’analyses', false, 'analyses')).toBe('Départements triés par le nombre d’analyses, de la plus faible à la plus forte.')
  })
})

describe('téléchargement CSV', () => {
  it('séparateur point-virgule, virgule décimale, marque UTF-8, CRLF, champs protégés', () => {
    expect(csvTableau(['Département', 'Part (%)'], [['Côtes-d’Armor', 12.5], ['A;B', null]])).toBe('﻿Département;Part (%)\r\nCôtes-d’Armor;12,5\r\n"A;B";\r\n')
    expect(pctCsv(0.12345)).toBe(12.3)
    expect(pctCsv(null)).toBeNull()
  })
  it('nom daté, année en cours signalée', () => {
    declarerPartiels([2026])
    expect(nomFichierSujet('pfas', 2025, new Date(2026, 9, 5))).toBe('meteo-du-robinet_pfas-departements_2025_2026-10-05.csv')
    expect(nomFichierSujet('plomb', 2026, new Date(2026, 9, 5))).toBe('meteo-du-robinet_plomb-departements_2026-depuis-le-1er-janvier_2026-10-05.csv')
  })
})

describe('tableau des départements de la carte détaillée', () => {
  const valeurs: Record<string, number | null> = { '75': 0.5, '02': 0.2, '43': 1, '38': null, '01': null }
  const effectifs: Record<string, number> = { '75': 4, '02': 279, '43': 1 }
  const noms: Record<string, string> = { '75': 'Paris', '02': 'Aisne', '43': 'Haute-Loire', '38': 'Isère', '01': 'Ain' }
  const lignes = lignesCarte(
    ['75', '02', '43', '38', '01', '02'],
    (d) => valeurs[d] ?? null,
    (d) => (effectifs[d] ? { n: effectifs[d], unite: ['réseau analysé', 'réseaux analysés'], total: d === '75' ? 4 : 300 } : null),
    (d) => noms[d],
    (d, v) => v != null || d === '38',
  )
  it('alphabétique, sans doublon ; un département sans valeur gardé à la demande (« pas d’information »)', () => {
    expect(lignes.map((l) => l.nom)).toEqual(['Aisne', 'Haute-Loire', 'Isère', 'Paris'])
  })
  it('règle des classements : Paris, tous ses réseaux analysés, se classe ; la Haute-Loire (1 sur 300) non', () => {
    expect(lignes.map((l) => [l.dd, l.classable])).toEqual([
      ['02', true],
      ['43', false],
      ['38', true],
      ['75', true],
    ])
    const col: CleTriable<(typeof lignes)[number]>[] = [{ cle: 'v', valeur: (l) => l.v, classable: (l) => l.classable }]
    expect(trierLignes(lignes, { cle: 'v', desc: true }, col).map((l) => l.dd)).toEqual(['75', '02', '43', '38'])
  })
})

import { describe, expect, it } from 'vitest'
import { accord, fmt } from './data'
import { parseSeuil } from './hubeau'
import { classesNonConformes, codeFamille, situationReseau, synthese, toneSituation } from './situations'
import { defaultYear, deptCode, deptOfInsee, dernierComplet, siseOfDept, yearLabel, type MetaFile } from './types'

describe('parseSeuil', () => {
  it('lit une limite haute avec virgule', () => expect(parseSeuil('<=0,1 µg/L')).toEqual({ max: 0.1 }))
  it('lit un intervalle', () => expect(parseSeuil('>=6,5 et <=9 unité pH')).toEqual({ min: 6.5, max: 9 }))
  it('ignore un seuil vide', () => expect(parseSeuil('')).toEqual({}))
  it('ignore un seuil absent', () => expect(parseSeuil(null)).toEqual({}))
})

describe('codes territoriaux', () => {
  it('convertit les codes SISE', () => {
    expect(deptCode('035')).toBe('35')
    expect(deptCode('02A')).toBe('2A')
    expect(deptCode('971')).toBe('971')
  })
  it('convertit vers SISE', () => {
    expect(siseOfDept('35')).toBe('035')
    expect(siseOfDept('2A')).toBe('02A')
    expect(siseOfDept('971')).toBe('971')
  })
  it('déduit le département du code INSEE', () => {
    expect(deptOfInsee('35238')).toBe('35')
    expect(deptOfInsee('97101')).toBe('971')
    expect(deptOfInsee('2A004')).toBe('2A')
    // Saint-Martin et Saint-Barthélemy n'ont ni fiche ni contour propres : repliés sur la Guadeloupe, comme
    // côté pipeline (build._dept_of_insee).
    expect(deptOfInsee('97701')).toBe('971')
    expect(deptOfInsee('97801')).toBe('971')
  })
})

describe('millésime par défaut', () => {
  const meta: MetaFile = { annees: [2023, 2024, 2025, 2026], partiel: [2026], construit_le: '', themes: [] }
  // Choix de l'auteur du 29/09 : le site s'ouvre sur l'année en cours, même partielle.
  it('prend l’année la plus récente, l’année en cours comprise', () => expect(defaultYear(meta)).toBe(2026))
  it('quel que soit l’ordre de meta.annees', () => expect(defaultYear({ ...meta, annees: [2026, 2023, 2025, 2024] })).toBe(2026))
  it('le dernier millésime complet reste disponible pour les comptes annuels', () => {
    expect(dernierComplet(meta)).toBe(2025)
    expect(dernierComplet({ ...meta, partiel: [2023, 2024, 2025, 2026] })).toBe(2026)
  })
  it('étiquette les millésimes en cours', () => {
    expect(yearLabel(meta, 2026)).toBe('2026 (en cours)')
    expect(yearLabel(meta, 2025)).toBe('2025')
  })
})

// Sémaphore de conformité (étude UX du 23/09) : une seule règle pour le verdict, la jauge et le tableau de
// situation, au sens du bilan officiel de chaque famille.
describe('sémaphore des situations', () => {
  it('pesticides : conforme, puis toute non-conformité en orange, la restriction en rouge', () => {
    expect([0, 1, 2, 3].map((c) => toneSituation('pesticides', c))).toEqual(['good', 'warn', 'warn', 'bad'])
  })
  it('nitrates : conforme jusqu’à 50 mg/L, classe 40–50 comprise ; pas de classe « restriction »', () => {
    expect([0, 1, 2, 3].map((c) => toneSituation('azote', c))).toEqual(['good', 'good', 'good', 'warn'])
  })
  it('bactériologie : « au moins 95 % » reste conforme, la consigne est rouge', () => {
    expect([0, 1, 2, 3].map((c) => toneSituation('microbio', c))).toEqual(['good', 'good', 'warn', 'bad'])
  })
  it('familles binaires et synthèse : conforme, dépassement, restriction', () => {
    expect([0, 1, 2].map((c) => toneSituation('pfas', c))).toEqual(['good', 'warn', 'bad'])
    expect([0, 1, 2].map((c) => toneSituation('toutes', c))).toEqual(['good', 'warn', 'bad'])
  })
})

// Fiche service du 23/09 : « sur les 1 réseaux », « 1 analyses ».
describe('accords en nombre', () => {
  it('singulier jusqu’à 1, pluriel à partir de 2', () => {
    expect([0, 1, 2, 12].map((n) => accord(n, 'réseau', 'réseaux'))).toEqual(['réseau', 'réseau', 'réseaux', 'réseaux'])
    expect(accord(1, 'non conforme')).toBe('non conforme')
    expect(accord(3, 'non conforme')).toBe('non conformes')
  })
  it('écrit le chiffre au format français, suivi de son nom accordé', () => {
    expect(fmt.nb(1, 'analyse')).toBe('1 analyse')
    expect(fmt.nb(2, 'analyse')).toBe('2 analyses')
    expect(fmt.nb(1234, 'analyse')).toBe(`${fmt.int(1234)} analyses`)
    expect(fmt.nb(7, 'réseau', 'réseaux')).toBe('7 réseaux')
  })
})

// Codes de situation : un chiffre par famille, dans l'ordre pesticides, nitrates, PFAS, bactériologie,
// métaux et minéraux, autres limites de qualité ; « - » quand la famille n'a pas été analysée.
describe('synthèse d’un ou de plusieurs réseaux (mêmes règles que le verdict)', () => {
  it('retient la classe la plus défavorable de chaque famille', () => {
    const s = synthese(['020000', '000100', undefined])
    expect(s.global).toBe(0)
    expect(s.pire).toEqual({ pesticides: 0, azote: 2, pfas: 0, microbio: 1, metaux_mineraux: 0, autres: 0 })
    // Nitrates de 40 à 50 mg/L et bactériologie à 95 % ou plus : conformes, mais des réserves.
    expect(s.reserves).toEqual(['azote', 'microbio'])
    expect(s.ennuis).toEqual([])
  })
  it('sépare les familles non conformes des réserves', () => {
    const s = synthese(['210200'])
    expect(s.global).toBe(1)
    expect(s.ennuis).toEqual(['pesticides', 'microbio'])
    expect(s.reserves).toEqual(['azote'])
  })
  it('aucune famille analysée : pas de situation', () => {
    expect(synthese(['------']).global).toBeNull()
    expect(synthese([]).global).toBeNull()
  })
  it('PFAS : un dépassement est une non-conformité, limite applicable depuis le 1er janvier 2023 (choix du 04/10)', () => {
    expect(classesNonConformes('pfas')).toEqual([1, 2])
    expect(codeFamille('001000', 'toutes')).toBe(1)
    expect(codeFamille('002000', 'toutes')).toBe(2)
    expect(codeFamille('001000', 'pfas')).toBe(1)
    const s = synthese(['001000', '020000'])
    expect([s.global, s.ennuis, s.reserves]).toEqual([1, ['pfas'], ['azote']])
  })
})

describe('situation d’un réseau en une ligne', () => {
  it('conforme, sans réserve ni famille manquante : rien à ajouter', () =>
    expect(situationReseau('000000')).toEqual({ classe: 0, ton: 'good', statut: 'conforme', detail: '' }))
  it('conforme avec une réserve : la réserve est nommée', () =>
    expect(situationReseau('020000').detail).toBe('avec une réserve : nitrates, maximum de 40 à 50 mg/L'))
  it('familles non analysées : le nombre de familles analysées est dit', () =>
    expect(situationReseau('-0-0--')).toEqual({ classe: 0, ton: 'good', statut: 'conforme', detail: '2 familles analysées sur 6' }))
  it('non conforme : les familles en cause, sans les réserves', () => {
    const s = situationReseau('210200')
    expect([s.ton, s.statut]).toEqual(['warn', 'non conforme'])
    expect(s.detail).toBe('pesticides, dépassements plus de 30 jours ; bactériologie, plus de 5 % de prélèvements non conformes')
  })
  it('consigne d’ébullition : restriction ou consigne, en rouge', () =>
    expect(situationReseau('000300')).toEqual({ classe: 2, ton: 'bad', statut: 'restriction ou consigne', detail: "bactériologie, consigne d'ébullition ou restriction" }))
  it('réseau sans analyse dans l’année', () => expect(situationReseau(undefined)).toEqual({ classe: null, ton: null, statut: 'non analysé', detail: '' }))
  it('PFAS : non conforme quelle que soit l’année des données', () => {
    for (const annee of [2023, 2025, 2026])
      expect(situationReseau('001000', annee)).toEqual({ classe: 1, ton: 'warn', statut: 'non conforme', detail: 'PFAS, au moins un dépassement constaté' })
  })
})

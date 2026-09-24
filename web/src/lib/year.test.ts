import { describe, expect, it } from 'vitest'
import type { MetaFile } from './types'
import { anneesFiche } from './year'

const META: MetaFile = { annees: [2023, 2024, 2025, 2026], partiel: [2026], construit_le: '2026-09-18', themes: [] }

describe('anneesFiche', () => {
  it('toutes les années du site, la partielle « en cours », celles sans données signalées sans être retirées', () => {
    expect(anneesFiche(META, ['2024', '2025'])).toEqual([
      { annee: 2023, enCours: false, sansDonnees: true },
      { annee: 2024, enCours: false, sansDonnees: false },
      { annee: 2025, enCours: false, sansDonnees: false },
      { annee: 2026, enCours: true, sansDonnees: true },
    ])
  })

  it('années en nombres ou en chaînes (clés des statistiques) ; sans liste, rien de signalé ; sans meta, rien', () => {
    expect(anneesFiche(META, [2025]).filter((a) => !a.sansDonnees).map((a) => a.annee)).toEqual([2025])
    expect(anneesFiche(META).some((a) => a.sansDonnees)).toBe(false)
    expect(anneesFiche(null, ['2025'])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { comptes, liste, ordreReseaux, phraseVerdict, reseauParDefaut, texteVerdict, tonBulletin, type ReseauBulletin } from './bulletin'
import { classesNonConformes, FAMILLES_SITU, libellesSituation, nbClasses, situationReseau, synthese } from './situations'
import type { CommuneYearStats } from './types'

// Codes de situation réels de 2025 (situations/2025.json) ; les phrases attendues sont celles de la maquette validée
// par l'auteur le 23/09 (docs/maquette-2026-09-23/donnees-maquette.json).
const r = (code: string, nom: string, situation: string | null): ReseauBulletin => ({ code, nom, situation })
const RENNES = [r('035004230', 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', '02000')]
const REIMS = [r('051000885', 'CU GRAND REIMS', '22010')]
const FONSORBES = [r('031004043', 'CTX DU TOUCH LHERM', '0--30')]
const CHERBOURG = [
  r('050000558', 'HAMEAU MESNAGE', '01000'),
  r('050000639', 'DIVETTE', '00001'),
  r('050000640', 'TOURLAVILLE EST', '00000'),
  r('050000641', 'TOURLAVILLE OUEST', '00000'),
  r('050000642', 'TRAISNELLERIE', '00000'),
  r('050000644', 'BENECERE', '00000'),
  r('050000645', 'ASSELINERIE', '01200'),
]
const verdict = (res: ReseauBulletin[]) => phraseVerdict(synthese(res.map((x) => x.situation)), 2025)

describe('verdict et phrase d’appui : les cas de la maquette', () => {
  it('Rennes : conforme aux limites, la réserve nitrates nommée', () => {
    expect(verdict(RENNES)).toBe('Eau conforme aux limites réglementaires en 2025')
    expect(texteVerdict(RENNES)).toBe('Avec une réserve : nitrates, maximum de 40 à 50 mg/L.')
    expect(tonBulletin(synthese(['02000']))).toBe('good')
  })
  it('Reims : non conforme pour les pesticides, deux réserves', () => {
    expect(verdict(REIMS)).toBe('Non conforme en 2025 pour la famille pesticides')
    expect(texteVerdict(REIMS)).toBe(
      'Pesticides et métabolites : dépassements plus de 30 jours. Avec des réserves : nitrates, maximum de 40 à 50 mg/L ; bactériologie, au moins 95 % de prélèvements conformes.',
    )
    expect(tonBulletin(synthese(['22010']))).toBe('warn')
  })
  it('Cherbourg-en-Cotentin : sept réseaux, les concernés du plus défavorable au moins défavorable', () => {
    expect(verdict(CHERBOURG)).toBe('Restriction ou consigne de consommation en 2025')
    expect(texteVerdict(CHERBOURG)).toBe(
      '2 des 7 réseaux qui desservent la commune sont concernés : restriction de consommation sur le réseau ASSELINERIE (PFAS) ; dépassement constaté sur le réseau DIVETTE (métaux et minéraux). Avec une réserve : nitrates, maximum de 25 à 40 mg/L.',
    )
    expect(tonBulletin(synthese(CHERBOURG.map((x) => x.situation)))).toBe('bad')
  })
  it('Fonsorbes : consigne bactériologique, deux familles non analysées', () => {
    expect(verdict(FONSORBES)).toBe('Restriction ou consigne de consommation en 2025')
    expect(texteVerdict(FONSORBES)).toBe("Bactériologie : consigne d'ébullition ou restriction. Nitrates et PFAS non analysés cette année.")
  })
  it('réseau conforme partout : « toute l’année », sans phrase d’appui', () => {
    const tourlaville = [r('050000640', 'TOURLAVILLE EST', '00000')]
    expect(verdict(tourlaville)).toBe("Eau conforme toute l'année pour les 5 familles analysées")
    expect(texteVerdict(tourlaville)).toBe('')
    expect(phraseVerdict(synthese(['---0-']), 2025)).toBe("Eau conforme toute l'année pour la famille analysée")
    expect(texteVerdict([r('x', 'X', '---0-')])).toBe('Pesticides et métabolites, nitrates, PFAS et métaux et minéraux non analysés cette année.')
    expect(texteVerdict([r('x', 'X', '0000-')])).toBe('Métaux et minéraux non analysés cette année.')
    expect(texteVerdict([r('x', 'X', '000-0')])).toBe('Bactériologie non analysée cette année.')
  })
  it('sans famille analysée : pas de verdict', () => {
    expect(phraseVerdict(synthese([null]), 2025)).toBeNull()
    expect(tonBulletin(synthese([undefined]))).toBe('na')
    expect(texteVerdict([r('x', 'X', null)])).toBe('')
  })
  it('plusieurs réseaux : accord au singulier, consigne bactériologique, réseau non analysé', () => {
    const res = [r('a', 'AMONT', '00000'), r('b', 'BOURG', '00030'), r('c', 'CAMPAGNE', null)]
    expect(texteVerdict(res)).toBe(
      "1 des 3 réseaux qui desservent la commune est concerné : consigne d'ébullition ou restriction sur le réseau BOURG (bactériologie). 1 des 3 réseaux n'a pas été analysé cette année.",
    )
    expect(texteVerdict([r('a', 'A', '30030'), r('b', 'B', '00000')], 'le service')).toBe(
      '1 des 2 réseaux qui desservent le service est concerné : restriction ou consigne sur le réseau A (pesticides et métabolites, bactériologie).',
    )
  })
})

describe('onglets des réseaux', () => {
  it('du plus défavorable au plus favorable, puis par nom ; le plus défavorable d’office', () => {
    expect(ordreReseaux(CHERBOURG).map((x) => x.nom)).toEqual([
      'ASSELINERIE',
      'DIVETTE',
      'BENECERE',
      'HAMEAU MESNAGE',
      'TOURLAVILLE EST',
      'TOURLAVILLE OUEST',
      'TRAISNELLERIE',
    ])
    expect(reseauParDefaut(CHERBOURG)?.code).toBe('050000645')
    expect(ordreReseaux([r('a', 'ÉCLUSE', null), r('b', 'Abbaye', '00000')]).map((x) => x.code)).toEqual(['b', 'a'])
    expect(reseauParDefaut([])).toBeNull()
  })
})

describe('synchronisation avec le détail (règle du CLAUDE.md), sur tous les codes possibles d’un réseau', () => {
  // Chaque famille : chacune de ses classes, ou « - » (non analysée).
  const choix = FAMILLES_SITU.map((f) => ['-', ...Array.from({ length: nbClasses(f) }, (_, i) => String(i))])
  const codes = choix.reduce<string[]>((acc, cs) => acc.flatMap((a) => cs.map((c) => a + c)), [''])

  it(`${codes.length} codes : jamais « toute l’année » avec une classe intermédiaire, chaque réserve et chaque cause nommées`, () => {
    expect(codes.length).toBe(5 * 5 * 4 * 5 * 4)
    for (const code of codes) {
      const s = synthese([code])
      const titre = phraseVerdict(s, 2025)
      const texte = texteVerdict([r('x', 'X', code)])
      const ligne = situationReseau(code)
      if (s.global == null) {
        expect(titre, code).toBeNull()
        continue
      }
      // Même statut que la ligne du tableau des réseaux (situationReseau, fiche service).
      expect(titre!.startsWith(['Eau conforme', 'Non conforme', 'Restriction'][s.global]), code).toBe(true)
      expect(ligne.statut, code).toBe(['conforme', 'non conforme', 'restriction ou consigne'][s.global])
      const intermediaire = FAMILLES_SITU.some((f) => {
        const c = s.pire[f]
        return c != null && c > 0 && !classesNonConformes(f).includes(c)
      })
      expect(titre!.includes("toute l'année"), code).toBe(s.global === 0 && !intermediaire)
      for (const f of [...s.reserves, ...s.ennuis]) expect(texte, code).toContain(libellesSituation(f)[s.pire[f]!])
    }
  })
})

describe('comptes et énumérations', () => {
  it('prélèvements, analyses et dépassements, comme les chiffres de la fiche', () => {
    const stats = {
      plv: [458, 0, 458, 0, 458, 0, 0],
      fam: { pesticides: [12000, 0, 0, 40], azote: [900, 2, 0, 900], microbio: [4000, 1, 3, 12] },
      cle: {},
      dep: [],
    } as unknown as CommuneYearStats
    expect(comptes(stats)).toEqual({ prelevements: 458, analyses: 16900, depassements: 3 })
    expect(comptes(undefined)).toBeNull()
  })
  it('« a, b et c »', () => {
    expect([liste([]), liste(['a']), liste(['a', 'b']), liste(['a', 'b', 'c'])]).toEqual(['', 'a', 'a et b', 'a, b et c'])
  })
})

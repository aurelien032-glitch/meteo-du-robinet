import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { comptes, liste, ordreReseaux, phraseVerdict, reseauParDefaut, texteVerdict, tonBulletin, type ReseauBulletin } from './bulletin'
import { classesNonConformes, declarerPartiels, FAMILLES_SITU, libelleClasse, nbClasses, situationReseau, synthese } from './situations'
import type { CommuneYearStats } from './types'

// Codes de situation réels de 2025 (situations/2025.json) ; les phrases attendues sont celles de la maquette validée
// par l'auteur le 23/09 (docs/maquette-2026-09-23/donnees-maquette.json).
const r = (code: string, nom: string, situation: string | null): ReseauBulletin => ({ code, nom, situation })
const RENNES = [r('035004230', 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', '020000')]
const REIMS = [r('051000885', 'CU GRAND REIMS', '220100')]
const FONSORBES = [r('031004043', 'CTX DU TOUCH LHERM', '0--300')]
const CHERBOURG = [
  r('050000558', 'HAMEAU MESNAGE', '010000'),
  r('050000639', 'DIVETTE', '000010'),
  r('050000640', 'TOURLAVILLE EST', '000000'),
  r('050000641', 'TOURLAVILLE OUEST', '000000'),
  r('050000642', 'TRAISNELLERIE', '000000'),
  r('050000644', 'BENECERE', '000000'),
  r('050000645', 'ASSELINERIE', '012000'),
]
const verdict = (res: ReseauBulletin[]) => phraseVerdict(synthese(res.map((x) => x.situation)), 2025)

describe('verdict et phrase d’appui : les cas de la maquette', () => {
  it('Rennes : conforme aux limites, la réserve nitrates nommée', () => {
    expect(verdict(RENNES)).toBe('Eau conforme aux limites réglementaires en 2025')
    expect(texteVerdict(RENNES)).toBe('Avec une réserve : nitrates, maximum de 40 à 50 mg/L.')
    expect(tonBulletin(synthese(['020000']))).toBe('good')
  })
  it('Reims : non conforme pour les pesticides, deux réserves', () => {
    expect(verdict(REIMS)).toBe('Non conforme en 2025 pour la famille pesticides')
    expect(texteVerdict(REIMS)).toBe(
      'Pesticides et métabolites : dépassements plus de 30 jours. Avec des réserves : nitrates, maximum de 40 à 50 mg/L ; bactériologie, quelques prélèvements non conformes, 5 % au plus.',
    )
    expect(tonBulletin(synthese(['220100']))).toBe('warn')
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
    const tourlaville = [r('050000640', 'TOURLAVILLE EST', '000000')]
    expect(verdict(tourlaville)).toBe("Eau conforme toute l'année pour les 6 familles analysées")
    expect(texteVerdict(tourlaville)).toBe('')
    expect(phraseVerdict(synthese(['---0--']), 2025)).toBe("Eau conforme toute l'année pour la famille analysée")
    expect(texteVerdict([r('x', 'X', '---0-0')])).toBe('Pesticides et métabolites, nitrates, PFAS et métaux et minéraux non analysés cette année.')
    expect(texteVerdict([r('x', 'X', '0000-0')])).toBe('Métaux et minéraux non analysés cette année.')
    expect(texteVerdict([r('x', 'X', '000-00')])).toBe('Bactériologie non analysée cette année.')
  })
  it('sans famille analysée : pas de verdict', () => {
    expect(phraseVerdict(synthese([null]), 2025)).toBeNull()
    expect(tonBulletin(synthese([undefined]))).toBe('na')
    expect(texteVerdict([r('x', 'X', null)])).toBe('')
  })
  it('PFAS au-dessus de 0,1 µg/L : non conforme dès 2023, la limite s’appliquant depuis le 1er janvier 2023', () => {
    // Note DGS/EA4/2023/61 du 14 avril 2023 (choix de l'auteur, 04/10) : plus de « future limite ».
    const pfas = [r('x', 'X', '001000')]
    expect(phraseVerdict(synthese(['001000']), 2023)).toBe('Non conforme en 2023 pour la famille PFAS')
    expect(phraseVerdict(synthese(['001000']), 2025)).toBe('Non conforme en 2025 pour la famille PFAS')
    expect(tonBulletin(synthese(['001000']))).toBe('warn')
    expect(texteVerdict(pfas, 'la commune', 2025)).toBe('PFAS : au moins un dépassement constaté.')
    expect(phraseVerdict(synthese(['002000']), 2025)).toBe('Restriction ou consigne de consommation en 2025')
    // Plusieurs réseaux : le réseau des PFAS est « concerné ».
    expect(texteVerdict([r('a', 'AMONT', '001000'), r('b', 'BOURG', '000000')], 'la commune', 2025)).toBe(
      '1 des 2 réseaux qui desservent la commune est concerné : dépassement constaté sur le réseau AMONT (PFAS).',
    )
    expect(ordreReseaux([r('a', 'AMONT', '000000'), r('b', 'BOURG', '001000')]).map((x) => x.code)).toEqual(['b', 'a'])
  })
  it('plusieurs réseaux : accord au singulier, consigne bactériologique, réseau non analysé', () => {
    const res = [r('a', 'AMONT', '000000'), r('b', 'BOURG', '000300'), r('c', 'CAMPAGNE', null)]
    expect(texteVerdict(res)).toBe(
      "1 des 3 réseaux qui desservent la commune est concerné : consigne d'ébullition ou restriction sur le réseau BOURG (bactériologie). 1 des 3 réseaux n'a pas été analysé cette année.",
    )
    expect(texteVerdict([r('a', 'A', '300300'), r('b', 'B', '000000')], 'le service')).toBe(
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
    expect(ordreReseaux([r('a', 'ÉCLUSE', null), r('b', 'Abbaye', '000000')]).map((x) => x.code)).toEqual(['b', 'a'])
    expect(reseauParDefaut([])).toBeNull()
  })
})

describe('synchronisation avec le détail (règle du CLAUDE.md), sur tous les codes possibles d’un réseau', () => {
  // Chaque famille : chacune de ses classes, ou « - » (non analysée).
  const choix = FAMILLES_SITU.map((f) => ['-', ...Array.from({ length: nbClasses(f) }, (_, i) => String(i))])
  const codes = choix.reduce<string[]>((acc, cs) => acc.flatMap((a) => cs.map((c) => a + c)), [''])

  // Toutes les années : un dépassement des PFAS est une non-conformité (limite applicable depuis le 1er janvier 2023).
  it.each([2023, 2026])(`${codes.length} codes en %i : jamais « toute l’année » avec une classe intermédiaire, chaque réserve et chaque cause nommées`, (annee) => {
    expect(codes.length).toBe(5 * 5 * 4 * 5 * 4 * 4)
    for (const code of codes) {
      const s = synthese([code])
      const titre = phraseVerdict(s, annee)
      const texte = texteVerdict([r('x', 'X', code)], 'la commune', annee)
      const ligne = situationReseau(code, annee)
      if (s.global == null) {
        expect(titre, code).toBeNull()
        continue
      }
      // Même statut que la ligne du tableau des réseaux (situationReseau, fiche service).
      expect(titre!.startsWith(['Eau conforme', 'Non conforme', 'Restriction'][s.global]), code).toBe(true)
      expect(ligne.statut, code).toBe(['conforme', 'non conforme', 'restriction ou consigne'][s.global])
      // Un dépassement des PFAS est toujours une cause de non-conformité, jamais une réserve.
      if (code[2] === '1') {
        expect(s.ennuis, code).toContain('pfas')
        expect(s.reserves, code).not.toContain('pfas')
      }
      const intermediaire = FAMILLES_SITU.some((f) => {
        const c = s.pire[f]
        return c != null && c > 0 && !classesNonConformes(f).includes(c)
      })
      expect(titre!.includes("toute l'année"), code).toBe(s.global === 0 && !intermediaire)
      for (const f of [...s.reserves, ...s.ennuis]) expect(texte, code).toContain(libelleClasse(f, s.pire[f]!, annee))
    }
  }, 30_000) // 8 000 codes : quelques secondes, davantage sur une machine chargée (build en parallèle, serveur de CI)
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

// Le site s'ouvre sur l'année en cours (choix de l'auteur du 29/09) : un bilan partiel ne dit jamais « toute l'année ».
describe('année en cours : bilan partiel, depuis le 1er janvier', () => {
  beforeEach(() => declarerPartiels(['2026']))
  afterEach(() => declarerPartiels([]))
  const v = (code: string, annee = '2026') => phraseVerdict(synthese([code]), annee)
  it('une conformité ne vaut que depuis le 1er janvier', () => {
    expect(v('000000')).toMatch(/^Eau conforme depuis le 1er janvier 2026 pour les \d familles analysées$/)
    expect(v('020000')).toBe('Eau conforme aux limites réglementaires depuis le 1er janvier 2026')
  })
  it('un dépassement reste daté de l’année', () => {
    expect(v('220100')).toMatch(/^Non conforme en 2026 pour /)
  })
  it('les familles non analysées le sont « depuis le 1er janvier »', () => {
    expect(texteVerdict([r('X', 'X', '0-0000')], 'la commune', '2026')).toMatch(/non analysée?s? depuis le 1er janvier\./)
    expect(texteVerdict([r('X', 'X', '000000'), r('Y', 'Y', null)], 'la commune', '2026')).toContain("1 des 2 réseaux n'a pas été analysé depuis le 1er janvier.")
  })
  it('la classe « conforme » des pesticides suit l’année', () => {
    expect(libelleClasse('pesticides', 0, '2026')).toBe('conforme depuis le 1er janvier')
    expect(libelleClasse('pesticides', 0, '2025')).toBe('conforme toute l’année')
  })
  it('les années complètes gardent leurs phrases', () => {
    expect(v('000000', '2025')).toMatch(/^Eau conforme toute l'année pour /)
    expect(v('020000', '2025')).toBe('Eau conforme aux limites réglementaires en 2025')
  })
  it('aucun des codes possibles ne dit « toute l’année » en 2026', () => {
    const chiffres = ['-', '0', '1', '2', '3']
    for (const a of chiffres) for (const b of chiffres) for (const c of chiffres) for (const d of chiffres) for (const e of chiffres) {
      const code = a + b + c + d + e
      const texte = `${v(code) ?? ''} ${texteVerdict([r('X', 'X', code)], 'la commune', '2026')}`
      expect(texte).not.toMatch(/toute l['’]année|cette année/)
    }
  })
})

describe('familles non analysées : accord', () => {
  const t = (code: string) => texteVerdict([r('X', 'X', code)], 'la commune', '2025')
  it('féminin pluriel pour les autres limites de qualité, féminin singulier pour la bactériologie seule', () => {
    expect(t('00000-')).toBe('Autres limites de qualité non analysées cette année.')
    expect(t('000-00')).toBe('Bactériologie non analysée cette année.')
    expect(t('000-0-')).toBe('Bactériologie et autres limites de qualité non analysées cette année.')
    expect(t('0-000-')).toBe('Nitrates et autres limites de qualité non analysés cette année.')
  })
})

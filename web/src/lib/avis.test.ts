import { describe, expect, it } from 'vitest'
import {
  avisDuReseau,
  avisEnCours,
  delegation,
  departementSansInformation,
  groupesAvis,
  periode,
  phraseCarteSansInformation,
  phraseSansInformation,
  phraseSuite,
  resumeSansInformation,
  sansInformation,
  suiteAvis,
  toneAvis,
  toneAvisCode,
  toneAvisSuivi,
  type LigneAvis,
  publicsAvis,
} from './avis'
import { fmt } from './data'
import { libelleAvisCarte, type AvisDeptFile, type LectureAvis } from './types'

// Formulations réelles d'avis/50.json et d'avis/31.json (catégories et causes du classement), textes abrégés ;
// 9001 et 9002 sont construites pour les cas limites.
const TEXTES: AvisDeptFile['textes'] = {
  '1970': { t: 'Suivi renforcé PFAS en sortie de station.  Restriction de consommation.', c: 'interdiction', l: false, k: ['PFAS'] },
  '1022': { t: 'Suivi renforcé PFAS en sortie de station. Publics sensibles.', c: 'sensibles', l: false, k: ['PFAS'] },
  '1388': { t: 'Suivi renforcé PFAS en sortie de station. Publics sensibles.', c: 'sensibles', l: false, k: ['PFAS'] },
  '464': { t: "Eau d'alimentation non conforme : bactériologie.", c: 'interdiction', l: false, k: ['bactériologie'] },
  '1863': { t: "Eau d'alimentation non conforme.", c: 'sensibles', l: false, k: [] },
  '9001': { t: 'Plomb au robinet d’un bâtiment : eau à ne pas boire dans ce bâtiment.', c: 'interdiction', l: true, k: ['plomb'] },
  '9002': { t: '', c: 'ebullition', l: false, k: [] },
  // avis/55.json : le même arrêté PFAS sous deux formulations (textes abrégés)
  '4792': { t: 'Somme des 20 PFAS supérieure à la limite. Consommation interdite par arrêté préfectoral.', c: 'interdiction', l: false, k: ['PFAS'] },
  '4793': { t: 'Somme des PFAS supérieure à la limite. Consommation interdite par arrêté préfectoral.', c: 'interdiction', l: false, k: ['PFAS'] },
}
/** Cherbourg-en-Cotentin (50129), réseau ASSELINERIE : quatre prélèvements avec avis en 2025. */
const CHERBOURG: LigneAvis[] = [
  ['2025-09-16', 1970, '050000645'],
  ['2025-09-02', 1022, '050000645'],
  ['2025-08-21', 1388, '050000645'],
  ['2025-08-05', 1388, '050000645'],
]
/** Fonsorbes (31187), réseau 031004043 : restriction en 2025, publics sensibles en 2026. */
const FONSORBES: LigneAvis[] = [
  ['2026-07-07', 1863, '031004043'],
  ['2025-05-20', 464, '031004043'],
]

describe('groupesAvis', () => {
  it('un groupe par formulation : le plus grave, puis le plus récent, d’abord', () => {
    const g = groupesAvis(CHERBOURG, TEXTES, '2025')
    expect(g.map((x) => [x.id, x.cat, x.n])).toEqual([
      [1970, 'interdiction', 1],
      [1022, 'sensibles', 1],
      [1388, 'sensibles', 2],
    ])
    expect(g[2]).toMatchObject({ debut: '2025-08-05', fin: '2025-08-21', reseaux: ['050000645'], causes: ['PFAS'] })
    expect(g[0].texte).toBe('Suivi renforcé PFAS en sortie de station. Restriction de consommation.')
  })

  it('avis limités à un bâtiment en dernier, formulations sans texte et autres années écartées', () => {
    const lignes: LigneAvis[] = [...FONSORBES, ['2025-06-01', 9001, '031004043'], ['2025-06-02', 9002, '031004043']]
    expect(groupesAvis(lignes, TEXTES, '2025').map((x) => [x.id, x.local])).toEqual([
      [464, false],
      [9001, true],
    ])
  })
})

/** Meuse (55425), réseau 055000810 : arrêté PFAS repris à chaque prélèvement, sous deux formulations. */
const MEUSE: LigneAvis[] = [
  ['2026-06-08', 4792, '055000810'],
  ['2026-04-13', 4793, '055000810'],
  ['2026-03-09', 4793, '055000810'],
  ['2026-02-02', 4793, '055000810'],
]

describe('avisEnCours', () => {
  it('Fonsorbes 2026 : publics sensibles le 07/07/2026, en orange tant que la suite est inconnue', () => {
    expect(avisEnCours(FONSORBES, TEXTES, '2026')).toEqual({
      categories: [{ cat: 'sensibles', debut: '2026-07-07', fin: '2026-07-07', suite: null }],
      ton: 'warn',
    })
  })
  it('le plus grave en tête, chaque catégorie datée de SES prélèvements', () => {
    const a = avisEnCours(CHERBOURG, TEXTES, '2025')!
    expect(a.categories.map(({ cat, debut, fin }) => [cat, debut, fin])).toEqual([
      ['interdiction', '2025-09-16', '2025-09-16'],
      ['sensibles', '2025-08-05', '2025-09-02'],
    ])
    expect(a.ton).toBe('bad')
  })
  it('suite de chaque catégorie ; ton du plus grave encore repris, neutre si aucun ne l’est', () => {
    expect(avisEnCours(FONSORBES, TEXTES, '2026', { '031004043': '2026-07-07' })).toMatchObject({
      categories: [{ suite: { reprise: true, date: '2026-07-07', reseaux: 1 } }],
      ton: 'warn',
    })
    expect(avisEnCours(FONSORBES, TEXTES, '2026', { '031004043': '2026-07-28' })).toMatchObject({
      categories: [{ suite: { reprise: false, date: '2026-07-28', reseaux: 1 } }],
      ton: null,
    })
    // Restriction de février absente des prélèvements suivants, publics sensibles repris le 20/07 : orange, pas rouge.
    const lignes: LigneAvis[] = [['2026-07-20', 1863, '031004043'], ['2026-02-11', 464, '031004043']]
    const a = avisEnCours(lignes, TEXTES, '2026', { '031004043': '2026-07-20' })!
    expect(a.categories.map((c) => [c.cat, c.suite?.reprise])).toEqual([
      ['interdiction', false],
      ['sensibles', true],
    ])
    expect(a.ton).toBe('warn')
  })
  it('rien sans avis de l’année, ni pour un avis limité à un bâtiment', () => {
    expect(avisEnCours(FONSORBES, TEXTES, '2024')).toBeNull()
    expect(avisEnCours([['2026-03-01', 9001, '031004043']], TEXTES, '2026')).toBeNull()
  })
})

describe('suite d’un avis de l’année en cours', () => {
  it('par catégorie, pas par formulation : l’arrêté de la Meuse est repris le 08/06 sous un autre texte', () => {
    const g = groupesAvis(MEUSE, TEXTES, '2026', { '055000810': '2026-06-08' })
    expect(g.map((x) => [x.id, x.fin, x.suite])).toEqual([
      [4792, '2026-06-08', { reprise: true, date: '2026-06-08', reseaux: 1 }],
      [4793, '2026-04-13', { reprise: true, date: '2026-06-08', reseaux: 1 }],
    ])
  })
  it('plusieurs réseaux : repris si l’un d’eux le reprend, sinon absent jusqu’au plus récent de leurs prélèvements', () => {
    const lignes: LigneAvis[] = [['2026-05-01', 464, '031000002'], ['2026-03-01', 464, '031000001']]
    expect(suiteAvis(lignes, TEXTES, { '031000001': '2026-07-01', '031000002': '2026-05-01' }, 'interdiction', '2026')).toEqual({
      reprise: true,
      date: '2026-05-01',
      reseaux: 2,
    })
    expect(suiteAvis(lignes, TEXTES, { '031000001': '2026-07-01', '031000002': '2026-06-15' }, 'interdiction', '2026')).toEqual({
      reprise: false,
      date: '2026-07-01',
      reseaux: 2,
    })
  })
  it('inconnue sans derniers prélèvements (fichier antérieur au 25/09) ; aucune pour un avis limité à un bâtiment', () => {
    expect(suiteAvis(MEUSE, TEXTES, undefined, 'interdiction', '2026')).toBeNull()
    expect(suiteAvis(MEUSE, TEXTES, {}, 'interdiction', '2026')).toBeNull()
    const g = groupesAvis([['2026-06-01', 9001, '031004043']], TEXTES, '2026', { '031004043': '2026-07-01' })
    expect(g[0].suite).toBeUndefined()
  })
  it('phrases et ton : des faits datés, sans répéter la date de la période ; neutre quand l’avis est absent ensuite', () => {
    // Wiège-Faty (02832), un seul avis, le 12/06/2026, dernier prélèvement connu du réseau
    expect(phraseSuite({ reprise: true, date: '2026-06-12', reseaux: 1 }, '2026-06-12', '2026-06-12')).toBe('au dernier prélèvement connu du réseau')
    expect(phraseSuite({ reprise: true, date: '2026-06-08', reseaux: 1 }, '2026-02-02', '2026-06-08')).toBe(
      'avis repris jusqu’au dernier prélèvement connu du réseau',
    )
    // Meuse, formulation de février à avril : l'arrêté est repris le 08/06 sous un autre texte
    expect(phraseSuite({ reprise: true, date: '2026-06-08', reseaux: 1 }, '2026-02-02', '2026-04-13')).toBe(
      'avis repris au dernier prélèvement connu du réseau, le 08/06/2026',
    )
    expect(phraseSuite({ reprise: false, date: '2026-07-23', reseaux: 2 }, '2026-03-01', '2026-05-01')).toBe(
      'avis absent des prélèvements suivants des réseaux concernés, jusqu’au 23/07/2026',
    )
    expect(toneAvisSuivi('interdiction', false, { reprise: true, date: '2026-06-08', reseaux: 1 })).toBe('bad')
    expect(toneAvisSuivi('interdiction', false, { reprise: false, date: '2026-07-23', reseaux: 1 })).toBeNull()
    expect(toneAvisSuivi('sensibles', false, null)).toBe('warn')
    expect(toneAvisSuivi('interdiction', true, null)).toBeNull()
  })
})

describe('avisDuReseau', () => {
  it('réunit les lignes du réseau depuis ses communes, sans doublon, les plus récentes d’abord', () => {
    const communes: AvisDeptFile['communes'] = {
      '31187': FONSORBES,
      '31901': [['2025-02-11', 1022, '031000999'], ...FONSORBES],
      '31902': [['2025-02-11', 1022, '031000999']],
    }
    expect(avisDuReseau(communes, '031004043')).toEqual(FONSORBES)
    expect(avisDuReseau(communes, '031000999')).toEqual([['2025-02-11', 1022, '031000999']])
    expect(avisDuReseau(communes, '035004230')).toEqual([])
  })
})

describe('ton et période', () => {
  it('publics sensibles en orange, ébullition et restriction en rouge, avis limité à un bâtiment neutre', () => {
    expect(toneAvis('sensibles')).toBe('warn')
    expect(toneAvis('ebullition')).toBe('bad')
    expect(toneAvis('interdiction')).toBe('bad')
    expect(toneAvis('interdiction', true)).toBeNull()
  })
  it('code d’avis de la carte des communes : le ton de sa catégorie, aucun pour « aucun avis »', () => {
    expect(toneAvisCode(1)).toBe('warn')
    expect(toneAvisCode(2)).toBe('bad')
    expect(toneAvisCode(3)).toBe('bad')
    expect(toneAvisCode(0)).toBeNull()
  })
  it('période écrite en dates françaises', () => {
    expect(periode('2025-09-16', '2025-09-16')).toBe('le 16/09/2025')
    expect(periode('2025-08-05', '2025-08-21')).toBe('du 05/08/2025 au 21/08/2025')
    expect(fmt.date('2026-07-22')).toBe('22/07/2026')
  })
})

// Comptes réels d'avis/national.json (construction du 24/09) : Isère muette les quatre années, Gironde muette en 2023
// et 2025 mais pas en 2024 (dix conclusions en parlent), Ain muet ; la Manche renseigne.
const LECTURE: LectureAvis = {
  lecture: {
    '01': { '2025': [3614, 0] },
    '33': { '2024': [4889, 10], '2025': [4784, 0] },
    '38': { '2025': [8234, 0] },
    '50': { '2025': [2412, 61] },
  },
  sans_information: { '2024': ['01', '38'], '2025': ['01', '33', '38'] },
}

describe('délégations sans information', () => {
  it('délégation d’un réseau : le département de son code', () => {
    expect(delegation('038000123')).toBe('38')
    expect(delegation('02B000470')).toBe('2B')
    expect(delegation('974000191')).toBe('974')
  })

  it('les délégations muettes parmi celles des réseaux affichés, et leurs conclusions de l’année', () => {
    expect(sansInformation(LECTURE, ['038000123', '038000456'], '2025')).toEqual({ delegations: ['38'], conclusions: 8234 })
    expect(sansInformation(LECTURE, ['050000645'], '2025')).toBeNull()
    // Gironde : muette en 2025, pas en 2024
    expect(sansInformation(LECTURE, ['033000011'], '2025')).toEqual({ delegations: ['33'], conclusions: 4784 })
    expect(sansInformation(LECTURE, ['033000011'], '2024')).toBeNull()
    // commune desservie par des réseaux de deux délégations muettes
    expect(sansInformation(LECTURE, ['038000123', '001000003', '050000645'], '2025')).toEqual({ delegations: ['01', '38'], conclusions: 11848 })
    // fichier d'un format antérieur : pas de jugement
    expect(sansInformation({}, ['038000123'], '2025')).toBeNull()
  })

  it('département sans information, pour les cartes', () => {
    expect(departementSansInformation(LECTURE, '38', '2025')).toBe(true)
    expect(departementSansInformation(LECTURE, '33', '2024')).toBe(false)
    expect(departementSansInformation(undefined, '38', '2025')).toBe(false)
  })

  it('phrases : celle du bulletin (maquette du 24/09) et la forme courte', () => {
    expect(phraseSansInformation('2025', 8234, 'de l’Isère')).toBe(
      'En 2025, aucune des 8\u202f234 conclusions de l’ARS sur les réseaux de l’Isère n’évoque de consigne, ni pour en prescrire une, ni pour l’écarter. L’absence d’avis ne permet donc pas de conclure à l’absence de consigne. La mairie et l’ARS font foi.',
    )
    expect(resumeSansInformation('2025', 8234)).toBe('aucune des 8\u202f234 conclusions de l’ARS n’évoque de consigne en 2025')
    expect(resumeSansInformation('2026', 1)).toBe('la seule conclusion de l’ARS n’évoque pas de consigne en 2026')
    expect(phraseCarteSansInformation('2025', 8234)).toBe(
      'Pas d’information sur les consignes. En 2025, aucune des 8\u202f234 conclusions de l’ARS n’évoque de consigne, ni pour en prescrire une, ni pour l’écarter. La mairie et l’ARS font foi.',
    )
  })

  it('libellé du code d’avis d’une commune sur les cartes : null, pas d’information ; absent, aucun avis', () => {
    expect(libelleAvisCarte(null)).toBe("pas d'information")
    expect(libelleAvisCarte(0)).toBe('aucun avis')
    expect(libelleAvisCarte(undefined)).toBe('aucun avis')
    expect(libelleAvisCarte(2)).toBe("consigne d'ébullition")
  })
})

describe('publics nommés par l’ARS', () => {
  it('lus sans les espaces des textes coupés, dans un ordre fixe', () => {
    expect(publicsAvis(['déconseillée aux femmes enceint es et aux nourris sons de moins de 6 mois'])).toEqual(['nourrissons de moins de 6 mois', 'femmes enceintes'])
    expect(publicsAvis(['populations sensibles (femmes enceintes, nourrissons) pour des usages alimentaires'])).toEqual(['nourrissons', 'femmes enceintes'])
    expect(publicsAvis(['déconseillée aux enfants de moins de 12 ans'])).toEqual(['enfants de moins de 12 ans'])
    expect(publicsAvis(['Eau non conforme aux limites.'])).toEqual([])
  })
})

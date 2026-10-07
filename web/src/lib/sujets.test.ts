import { describe, expect, it } from 'vitest'
import routesStatiques from '../../scripts/routes-statiques.mjs?raw'
import { SUJETS_ACCUEIL } from './accueil'
import { fmt } from './data'
import { declarerPartiels, type SituationsFile } from './situations'
import {
  analysesParAnnee,
  analysesParDept,
  anneesTfa,
  bilanFamille,
  bilanReferences,
  DEF_COMPTE,
  deptsTfa,
  entetesCsvSujet,
  FAMILLE_THEME,
  ligneCsvSujet,
  lignesAvis,
  lignesHorsGrille,
  lignesReferences,
  lignesSujet,
  limitesFamille,
  MESURES,
  PAGES_THEMES,
  phraseAvisCause,
  phraseRechercheTfa,
  REF_ARRETE,
  SUJETS,
  titreBilanFamille,
  titreBilanReferences,
  tonCommun,
} from './sujets'
import type { AvisNationalFile, HorsGrilleFile, ParamsFile, SeriesFile, ThemeFile } from './types'

describe('les sujets', () => {
  it('dans l’ordre de l’accueil, puis métaux et minéraux, radioactivité et substances sans limite', () => {
    expect(SUJETS.map((s) => s.titre)).toEqual([
      'PFAS et TFA',
      'Pesticides',
      'Nitrates',
      'Bactéries',
      'Plomb et canalisations',
      'Avis de l’ARS',
      'Métaux et minéraux',
      'Radioactivité',
      'Substances sans limite de qualité',
    ])
    expect(SUJETS_ACCUEIL).toEqual(SUJETS.slice(0, 6))
    expect(SUJETS.find((s) => s.titre === 'Plomb et canalisations')?.to).toBe('/themes/plomb')
  })
  it('les pages de thème et la page du plomb ont un titre et une description, repris tels quels par les pages statiques', () => {
    for (const slug of [...Object.keys(FAMILLE_THEME), 'plomb']) {
      const p = PAGES_THEMES[slug]
      expect(p, slug).toBeDefined()
      expect(routesStatiques).toContain(`titre: '${p.titre}', description: '${p.description}'`)
    }
    expect(routesStatiques).toContain("route: '/themes/plomb'")
  })
})

describe('ce que mesure le contrôle sanitaire', () => {
  it('deux à quatre phrases par sujet, l’arrêté du 11 janvier 2007 toujours cité, avec son adresse sur Légifrance', () => {
    for (const [slug, m] of Object.entries(MESURES)) {
      expect(m.phrases.length, slug).toBeGreaterThanOrEqual(2)
      expect(m.phrases.length, slug).toBeLessThanOrEqual(4)
      expect(m.references, slug).toContain(REF_ARRETE)
      expect(m.methode.startsWith('/methode#'), slug).toBe(true)
    }
    expect(REF_ARRETE.url).toBe('https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000465574')
  })
  it('les valeurs des textes : PFAS 0,1 µg/L depuis 2023, plomb 10 µg/L au robinet et 5 µg/L en 2036, nitrates 50 mg/L', () => {
    expect(MESURES.pfas.phrases.join(' ')).toMatch(/0,1 µg\/L.*20 .*PFAS|20 .*PFAS.*0,1 µg\/L/)
    expect(MESURES.pfas.phrases.join(' ')).toContain('1er janvier 2023')
    expect(MESURES.pfas.phrases.join(' ')).toContain('1er janvier 2026')
    expect(MESURES.plomb.phrases[0]).toContain('10 µg/L au robinet du consommateur')
    expect(MESURES.plomb.phrases[0]).toContain('5 µg/L à partir du 1er janvier 2036')
    expect(MESURES.nitrates.phrases[0]).toContain('50 mg/L')
    expect(MESURES.radioactivite.phrases[0]).toContain('références de qualité, et non des limites')
  })
  it('ni question rhétorique, ni cause avancée, ni recommandation sanitaire, ni « non conforme » pour la radioactivité', () => {
    const textes = [...Object.values(MESURES).flatMap((m) => m.phrases), ...Object.values(DEF_COMPTE), ...SUJETS.map((s) => s.texte)]
    for (const t of textes) expect(t).not.toMatch(/\?|provient|à cause|\bdûe?s?\b|\bdue\b|nous recommandons|nous conseillons|danger|il faut|évitez|buvez/i)
    expect(MESURES.radioactivite.phrases.join(' ')).not.toMatch(/non conforme(?!s? )|réseaux non conformes/)
  })
  it('limites des métaux et minéraux lues dans le contrôle sanitaire, sans plomb, cuivre, nickel ni sommes', () => {
    const params = [
      { p: '1382', l: 'Plomb', n: 900, nd: 5, nq: 1, npd: 1 },
      { p: '1369', l: 'Arsenic', n: 800, nd: 3, nq: 1, npd: 1 },
      { p: '7073', l: 'Fluorures mg/L', n: 700, nd: 2, nq: 1, npd: 1 },
      { p: '9999', l: 'Total quelque chose', n: 10000, nd: 0, nq: 0, npd: 0 },
      { p: '1394', l: 'Manganèse', n: 750, nd: 0, nq: 1, npd: 0 },
    ] as ThemeFile['params']
    const infos = {
      '1382': { lim: '<=10 µg/L' },
      '1369': { lim: '<=10 µg/L' },
      '7073': { lim: '<=1,5 mg/L' },
      '9999': { lim: '<=1 µg/L' },
      '1394': { lim: null },
    } as unknown as ParamsFile['params']
    expect(limitesFamille(params, infos)).toEqual(['Arsenic ≤ 10 µg/L', 'Fluorures ≤ 1,5 mg/L'])
  })
})

describe('bilan d’une famille', () => {
  declarerPartiels([2026])
  it('pesticides : réseaux analysés, non conformes au sens du bilan national, une ligne par classe', () => {
    const b = bilanFamille([11929, 209, 1750, 3], 'pesticides', 2025)!
    expect(b.analyses).toBe(13891)
    expect(b.nonConformes).toBe(1962)
    expect(b.classes.map((c) => [c.libelle, c.n, c.nonConforme])).toEqual([
      ['conforme toute l’année', 11929, false],
      ['dépassements 30 jours au plus', 209, true],
      ['dépassements plus de 30 jours', 1750, true],
      ['restriction de consommation', 3, true],
    ])
    expect(titreBilanFamille(b)).toBe('14,1 % des réseaux analysés sont non conformes')
  })
  it('année en cours : « conforme depuis le 1er janvier »', () => {
    expect(bilanFamille([10, 1, 0, 0], 'pesticides', 2026)!.classes[0].libelle).toBe('conforme depuis le 1er janvier')
  })
  it('nitrates : seule la classe au-dessus de 50 mg/L est non conforme ; les réserves restent conformes', () => {
    const b = bilanFamille([17307, 3208, 1172, 427], 'azote', 2025)!
    expect(b.nonConformes).toBe(427)
    expect(b.classes.map((c) => c.ton)).toEqual(['good', 'good', 'good', 'warn'])
  })
  it('PFAS : trois classes, dépassement constaté et restriction', () => {
    const b = bilanFamille([13878, 59, 16, 0], 'pfas', 2025)!
    expect(b.classes).toHaveLength(3)
    expect(b.nonConformes).toBe(75)
    expect(titreBilanFamille(bilanFamille([1, 1, 0, 0], 'pfas', 2025)!)).toBe('50,0 % des réseaux analysés est non conforme')
  })
  it('sans répartition : rien ; sans réseau analysé : pas de part', () => {
    expect(bilanFamille(undefined, 'pfas', 2025)).toBeNull()
    expect(bilanFamille([0, 0, 0, 0], 'pfas', 2025)!.part).toBeNull()
  })
  it('voyant d’un compte : le ton commun des classes, jamais pour un compte nul, deux tons mêlés ou une réserve', () => {
    expect(tonCommun('pesticides', [1, 2, 3], 10)).toBeUndefined()
    expect(tonCommun('azote', [3], 10)).toBe('warn')
    expect(tonCommun('azote', [3], 0)).toBeUndefined()
    expect(tonCommun('azote', [1, 2], 10)).toBeUndefined()
    expect(tonCommun('pfas', [1], 2)).toBe('warn')
  })
  it('radioactivité : réseaux au-dessus d’une référence de qualité, jamais « non conformes »', () => {
    const b = bilanReferences({ n: 1, nd: 0, nq: 0, npd: 0, res_tot: 200, res_ref: 11 })!
    expect(b.part).toBeCloseTo(0.055)
    expect(titreBilanReferences(b)).toBe('5,5 % des réseaux analysés au-dessus d’une référence de qualité')
    expect(bilanReferences({ n: 1, nd: 0, nq: 0, npd: 0 })).toBeNull()
  })
})

describe('avis de l’ARS qui citent une cause', () => {
  const causes: AvisNationalFile['causes'][string] = {
    interdiction: { PFAS: 36, arsenic: 17, plomb: 1 },
    sensibles: { PFAS: 1, fluorures: 2 },
    ebullition: { bactériologie: 23 },
  }
  it('prélèvements par catégorie, accordés', () => {
    expect(phraseAvisCause(causes, 'pfas', 'depuis le 1er janvier 2026')).toBe(
      'Les conclusions de l’ARS publiées depuis le 1er janvier 2026 citent les PFAS pour 36 prélèvements assortis d’une restriction de consommation et 1 prélèvement dont l’eau est déconseillée aux publics sensibles.',
    )
    expect(phraseAvisCause(causes, 'plomb', 'en 2025')).toBe('Les conclusions de l’ARS publiées en 2025 citent le plomb pour 1 prélèvement assorti d’une restriction de consommation.')
  })
  it('plusieurs causes : une proposition par cause, jamais une somme (une conclusion peut en citer plusieurs)', () => {
    expect(phraseAvisCause(causes, 'metaux', 'en 2025')).toBe(
      'Les conclusions de l’ARS publiées en 2025 citent l’arsenic pour 17 prélèvements assortis d’une restriction de consommation ; les fluorures pour 2 prélèvements dont l’eau est déconseillée aux publics sensibles.',
    )
  })
  it('aucun avis : une phrase entière ; sujet sans cause relevée ou sans données : rien', () => {
    expect(phraseAvisCause(causes, 'nitrates', 'en 2025')).toBe(
      'Aucune conclusion de l’ARS publiée en 2025 ne cite les nitrates parmi les causes d’une restriction de consommation, d’une consigne d’ébullition ou d’une eau déconseillée aux publics sensibles.',
    )
    expect(phraseAvisCause(causes, 'tfa', 'en 2025')).toBeNull()
    expect(phraseAvisCause(undefined, 'pfas', 'en 2025')).toBeNull()
  })
})

describe('tableau des départements d’une famille', () => {
  const situ = {
    familles: [],
    national: {},
    reseaux: { '002000001': '0', '002000002': '0', '075000001': '0', '02A000001': '0' },
    depts: {
      '02': { pfas: [8, 1, 1, 0] },
      '75': { pfas: [3, 1, 0, 0] },
      '2A': { pfas: [0, 0, 0, 0], azote: [1, 0, 0, 0] },
      '971': { pfas: [5, 0, 0, 0] },
    },
  } as unknown as SituationsFile
  const nom = (dd: string) => ({ '02': 'Aisne', '75': 'Paris', '2A': 'Corse-du-Sud', '971': 'Guadeloupe' })[dd] ?? dd
  it('une ligne par département analysé, dans l’ordre alphabétique ; règle des classements sur les réseaux du département', () => {
    const l = lignesSujet(situ, 'pfas', nom, [2])
    expect(l.map((x) => [x.nom, x.comptes, x.analyses, x.detail, x.classable])).toEqual([
      ['Aisne', 2, 10, 1, true],
      ['Guadeloupe', 0, 5, 0, false],
      // Paris : ses réseaux sont tous analysés, sa part se classe (règle des classements).
      ['Paris', 1, 4, 0, true],
    ])
    expect(l[0].part).toBe(0.2)
  })
  it('départements sans contour écartés à la demande', () => {
    expect(lignesSujet(situ, 'pfas', nom, [2], (dd) => dd !== '971').map((x) => x.dd)).toEqual(['02', '75'])
  })
  it('CSV : les classes de la famille, les non conformes, leur part et la règle des tris', () => {
    const [aisne] = lignesSujet(situ, 'pfas', nom, [2])
    expect(entetesCsvSujet('pfas', 2025)).toEqual([
      'Code du département',
      'Département',
      'Année',
      'Réseaux analysés',
      'Réseaux : conforme',
      'Réseaux : au moins un dépassement constaté',
      'Réseaux : restriction de consommation',
      'Réseaux non conformes',
      'Part des réseaux non conformes (%)',
      'Part retenue dans les tris (10 réseaux au moins, ou tous)',
    ])
    expect(ligneCsvSujet(aisne, 'pfas', 2025)).toEqual(['02', 'Aisne', '2025', 10, 8, 1, 1, 2, 20, 'oui'])
    expect(entetesCsvSujet(null, 2025)[4]).toBe('Réseaux au-dessus d’une référence de qualité')
  })
  it('radioactivité : réseaux au-dessus d’une référence, d’après le fichier du thème', () => {
    const t = { depts: { '043': { '2025': { n: 3, nd: 0, nq: 1, res_dep: 0, res_tot: 1, res_ref: 1 } }, '002': { '2025': { n: 50, nd: 0, nq: 2, res_dep: 0, res_tot: 20, res_ref: 2 } } } } as unknown as ThemeFile
    const l = lignesReferences(t, 2025, (dd) => ({ '43': 'Haute-Loire', '02': 'Aisne' })[dd] ?? dd, new Map([['43', 369], ['02', 279]]))
    expect(l.map((x) => [x.dd, x.comptes, x.analyses, x.classable])).toEqual([
      ['02', 2, 20, true],
      ['43', 1, 1, false],
    ])
  })
})

describe('plomb et canalisations', () => {
  const serie = {
    mois: ['2024-11', '2024-12', '2025-01', '2025-02'],
    national: { n: [10, 20, 30, null], nd: [1, 0, 2, null] },
    depts: { '002': { n: [5, 0, 8, 4], nd: [1, 0, 0, 1], max: [] }, '075': { n: [0, 0, 0, 0], nd: [0, 0, 0, 0], max: [] } },
  } as unknown as SeriesFile
  it('analyses et résultats au-dessus de la limite, par année, d’après la série mensuelle nationale', () => {
    expect([...analysesParAnnee(serie)]).toEqual([
      ['2024', { n: 30, nd: 1 }],
      ['2025', { n: 30, nd: 2 }],
    ])
  })
  it('par département pour une année ; règle des 10 analyses pour un paramètre', () => {
    expect(analysesParDept(serie, 2025, () => 'Aisne')).toEqual([{ dd: '02', nom: 'Aisne', n: 12, nd: 1, part: 1 / 12, classable: true }])
    expect(analysesParDept(serie, 2024, () => 'Aisne')[0].classable).toBe(false)
  })
})

describe('TFA', () => {
  const hg = {
    annees: ['2023', '2024', '2025'],
    groupes: {},
    substances: { '8858': { l: 'acide trifluoroacétique', u: 'µg/L', g: 'tfa', reperes: [], annees: { '2025': { n: 14, nq: 14, res: 2, res_q: 2, com: 3, com_q: 3, vmax: 3.69 } } } },
    par_groupe: { tfa: { '2025': { com: 3, com_q: 3, subst_q: 1, com_tot: 34817 } } },
    depts: { tfa: { '2025': { '34': [341, 3, 3], '30': [300, 0, 0] } } },
  } as unknown as HorsGrilleFile
  it('une ligne par année, les années sans analyse à zéro', () => {
    const a = anneesTfa(hg)
    expect(a.map((x) => [x.annee, x.analyses, x.communes, x.communesTotal])).toEqual([
      ['2023', 0, 0, null],
      ['2024', 0, 0, null],
      ['2025', 14, 3, 34817],
    ])
    expect(phraseRechercheTfa(a[2])).toBe(`En 2025, le TFA a été recherché sur 2 réseaux desservant 3 communes sur ${fmt.int(34817)} ; il a été quantifié dans 14 analyses sur 14.`)
    expect(phraseRechercheTfa(a[0])).toBe('En 2023, aucune analyse du TFA n’est publiée.')
  })
  it('départements où il a été recherché, par ordre alphabétique', () => {
    expect(deptsTfa(hg, 2025, (dd) => (dd === '34' ? 'Hérault' : 'Gard'))).toEqual([{ dd: '34', nom: 'Hérault', cherche: 3, quantifie: 3 }])
  })
  it('substances sans limite : parts des communes, dans l’ordre alphabétique', () => {
    const l = lignesHorsGrille(hg, 'tfa', 2025, (dd) => (dd === '34' ? 'Hérault' : 'Gard'))
    expect(l.map((x) => x.nom)).toEqual(['Gard', 'Hérault'])
    expect(l[1].partCherche).toBeCloseTo(3 / 341)
  })
})

describe('avis de l’ARS par département', () => {
  const nat = {
    sans_information: { '2025': ['38', '73'] },
    depts: { '02': { '2025': { toutes: 211, interdiction: 19, sensibles: 193 } }, '73': { '2025': { toutes: 2, interdiction: 2 } } },
  } as unknown as AvisNationalFile
  it('tous les départements, dans l’ordre alphabétique ; « pas d’information » sans valeur, jamais « aucun avis »', () => {
    const l = lignesAvis(nat, 2025, [
      ['73', 'Savoie'],
      ['02', 'Aisne'],
      ['38', 'Isère'],
      ['35', 'Ille-et-Vilaine'],
    ])
    expect(l.map((x) => [x.nom, x.toutes, x.sansInformation])).toEqual([
      ['Aisne', 211, false],
      ['Ille-et-Vilaine', 0, false],
      ['Isère', null, true],
      ['Savoie', 2, true],
    ])
  })
})

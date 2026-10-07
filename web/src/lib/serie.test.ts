import { describe, expect, it } from 'vitest'
import { echelleSerie, graphiquesBulletin, limiteSerie, nomMois, parametresFamille, phraseSerie, resumeSerie, serieAnnee, serieReseaux } from './serie'
import { declarerPartiels } from './situations'
import type { CommuneYearStats, ParamInfo, SeriesReseauxFile } from './types'

const stats = (dep: CommuneYearStats['dep']): CommuneYearStats => ({ plv: [0, 0, 0, 0, 0, 0, 0], fam: {}, cle: {}, dep })
const ligne = (code: string, n: number, nd: number, max: number): CommuneYearStats['dep'][number] => [code, n, nd, 0, n, max, null, null, null]
const param = (f: string, l: string, lim: string | null = null, k: string | null = null) => ({ f, l, lim, k, u: 'µg/L' }) as unknown as ParamInfo
const PARAMS: Record<string, ParamInfo> = {
  '1340': { ...param('azote', 'Nitrates (en NO3)', '<=50 mg/L', 'Nitrates'), u: 'mg/L' },
  '1339': { ...param('azote', 'Nitrites (en NO2)', '<=0,5 mg/L'), u: 'mg/L' },
  '6276': param('pesticides', 'Total des pesticides analysés', '<=0,5 µg/L', 'Total pesticides'),
  '6378': param('pesticides', 'ESA métolachlore', '<=0,1 µg/L'),
  '6379': param('pesticides', 'OXA métolachlore', '<=0,1 µg/L'),
  '1107': param('pesticides', 'Atrazine', '<=0,1 µg/L'),
  '1101': param('pesticides', 'Alachlore', '<=0,1 µg/L'),
  '8865': param('pesticides', 'Chlorothalonil R471811', '<=0,1 µg/L'),
  '8847': param('pfas', 'Somme de 20 substances perfluoroalkylées (PFAS)', '<=0,1 µg/L', 'Somme 20 PFAS'),
  '1369': param('metaux_mineraux', 'Arsenic', '<=10 µg/L'),
  '1382': param('metaux_mineraux', 'Plomb', '<=10 µg/L'),
  '1449': param('microbio', 'Escherichia coli /100ml - MF', '<=0 n/(100mL)'),
}
// Un mois publié : [mois 1-12, analyses, dépassements, maximum].
const tous = (max: number) => Array.from({ length: 12 }, (_, i): [number, number, number, number] => [i + 1, 1, 0, max])
const fichier = (reseaux: SeriesReseauxFile['reseaux'], annee = 2025): SeriesReseauxFile => ({ annee, reseaux })

describe('graphiquesBulletin : un graphique par famille en cause', () => {
  const F = fichier({
    R: { '1340': tous(30), '1339': tous(0.6), '6276': tous(0.6), '6378': tous(0.2), '6379': tous(0.2), '8847': tous(0.3), '1369': tous(12), '1382': tous(15) },
  })
  it('Rennes (02000) : les nitrates, en réserve entre 40 et 50 mg/L, sans dépassement', () => {
    expect(graphiquesBulletin('020000', stats([]), F, 'R', PARAMS)).toEqual([{ famille: 'azote', parametres: ['1340'] }])
  })
  it('ASSELINERIE (01200) : les PFAS en restriction passent avant les nitrates en réserve', () => {
    expect(graphiquesBulletin('012000', stats([ligne('8847', 42, 15, 0.459)]), F, 'R', PARAMS)).toEqual([
      { famille: 'pfas', parametres: ['8847'] },
      { famille: 'azote', parametres: ['1340'] },
    ])
  })
  it('Reims (22010) : pesticides puis nitrates, à gravité égale dans l’ordre du bulletin ; le plus souvent au-dessus d’abord ; pas de bactériologie', () => {
    const reims = stats([ligne('6378', 18, 17, 1.13), ligne('6276', 18, 8, 1.409), ligne('6379', 18, 4, 0.222), ligne('1449', 50, 2, 3)])
    expect(graphiquesBulletin('220100', reims, F, 'R', PARAMS)).toEqual([
      { famille: 'pesticides', parametres: ['6378', '6276', '6379'] },
      { famille: 'azote', parametres: ['1340'] },
    ])
  })
  it('les nitrites, jugés avec les autres limites (05/10), quittent le graphique des nitrates pour celui des autres limites', () => {
    expect(graphiquesBulletin('030000', stats([ligne('1339', 12, 5, 0.6), ligne('1340', 12, 2, 55)]), F, 'R', PARAMS)).toEqual([
      { famille: 'azote', parametres: ['1340'] },
    ])
    expect(graphiquesBulletin('030001', stats([ligne('1339', 12, 5, 0.6), ligne('1340', 12, 2, 55)]), F, 'R', PARAMS)).toEqual([
      { famille: 'azote', parametres: ['1340'] },
      { famille: 'autres', parametres: ['1339'] },
    ])
  })
  it('métaux : le plomb, lié aux canalisations, n’est pas proposé ; seul en cause, pas de graphique', () => {
    expect(graphiquesBulletin('000010', stats([ligne('1382', 4, 2, 15), ligne('1369', 4, 1, 12)]), F, 'R', PARAMS)).toEqual([
      { famille: 'metaux_mineraux', parametres: ['1369'] },
    ])
    expect(graphiquesBulletin('000010', stats([ligne('1382', 4, 2, 15)]), F, 'R', PARAMS)).toEqual([])
  })
  it('rien sans fichier, sans le réseau, sans paramètre publié ou pour un réseau conforme', () => {
    expect(graphiquesBulletin('020000', stats([]), null, 'R', PARAMS)).toEqual([])
    expect(graphiquesBulletin('020000', stats([]), F, 'X', PARAMS)).toEqual([])
    expect(graphiquesBulletin('100000', stats([ligne('1107', 3, 1, 0.2)]), F, 'R', PARAMS)).toEqual([])
    expect(graphiquesBulletin('000000', stats([]), F, 'R', PARAMS)).toEqual([])
    expect(graphiquesBulletin(null, undefined, F, 'R', PARAMS)).toEqual([])
  })
})

describe('parametresFamille : menus du détail « Mois par mois »', () => {
  const F = fichier({
    A: { '6276': tous(0), '1101': tous(0.03), '6378': [[3, 2, 1, 0.15]], '1107': tous(0), '1340': tous(20) },
    B: { '6378': [[4, 1, 1, 0.12]], '1107': [[5, 1, 0, 0.02]], '8847': tous(0.004) },
  })
  it('le paramètre de synthèse d’abord, même jamais quantifié, puis les dépassements, puis les autres quantifiés par ordre alphabétique', () => {
    expect(parametresFamille(F, ['A'], 'pesticides', '6276', PARAMS)).toEqual(['6276', '6378', '1101'])
    expect(parametresFamille(F, ['A', 'B'], 'pesticides', '6276', PARAMS)).toEqual(['6276', '6378', '1101', '1107'])
    expect(parametresFamille(F, ['A'], 'azote', '1340', PARAMS)).toEqual(['1340'])
    expect(parametresFamille(F, ['A'], 'pfas', '8847', PARAMS)).toEqual([])
    expect(parametresFamille(F, ['B'], 'pfas', '8847', PARAMS)).toEqual(['8847'])
  })
})

describe('limiteSerie', () => {
  it('chlorothalonil R471811 : limite jusqu’en 2023, aucune depuis l’avis de l’Anses de 2024', () => {
    expect(limiteSerie('8865', PARAMS['8865'], 2023)).toBe(0.1)
    expect(limiteSerie('8865', PARAMS['8865'], 2024)).toBeNull()
    expect(limiteSerie('1340', PARAMS['1340'], 2025)).toBe(50)
    expect(limiteSerie('9999', undefined, 2025)).toBeNull()
  })
})

// Séries 2025 publiées (series/reseaux/2025/50.json et 35.json).
const FICHIER = fichier({
  '050000645': {
    '8847': [[2, 1, 1, 0.261], [3, 2, 2, 0.459], [4, 2, 2, 0.351], [5, 2, 2, 0.316], [6, 2, 2, 0.261], [7, 2, 2, 0.227], [8, 2, 2, 0.222], [9, 6, 2, 0.256], [10, 12, 0, 0.004], [11, 8, 0, 0.004], [12, 3, 0, 0.003]],
  },
  '035004230': {
    '1340': [[1, 39, 0, 42.1], [2, 36, 0, 41.8], [3, 33, 0, 41.7], [4, 37, 0, 40.7], [5, 33, 0, 39.6], [6, 36, 0, 36.6], [7, 41, 0, 33.8], [8, 41, 0, 45.9], [9, 40, 0, 30.5], [10, 41, 0, 37], [11, 39, 0, 26.7], [12, 38, 0, 30.3]],
  },
})

describe('serieAnnee et resumeSerie', () => {
  it('ASSELINERIE 2025 : 15 analyses sur 42 au-dessus de la limite, de février à septembre, maximum en mars', () => {
    const serie = serieAnnee(FICHIER, '050000645', '8847')!
    expect(serie).toHaveLength(12)
    expect(serie[0]).toEqual({ mois: '2025-01', max: null, analyses: 0, depassements: 0 })
    const r = resumeSerie(serie)
    expect(r).toEqual({ analyses: 42, depassements: 15, moisAvecDepassement: 8, maximum: 0.459, moisDuMaximum: '2025-03' })
    expect(serie.filter((x) => x.depassements).map((x) => nomMois(x.mois))).toEqual(['février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre'])
  })
  it('Rennes 2025 : le maximum de l’année, 45,9 mg/L en août, est celui qui fait la classe', () => {
    const r = resumeSerie(serieAnnee(FICHIER, '035004230', '1340')!)
    expect([r.maximum, nomMois(r.moisDuMaximum!), r.analyses, r.depassements]).toEqual([45.9, 'août', 454, 0])
  })
  it('null pour un réseau ou un paramètre absents', () => {
    expect(serieAnnee(FICHIER, '050000645', '1340')).toBeNull()
    expect(serieAnnee(FICHIER, '099999999', '8847')).toBeNull()
  })
})

describe('séries de plusieurs réseaux et échelles', () => {
  it('détail d’une commune : maximum du mois sur l’ensemble, comptes additionnés', () => {
    const deux = fichier({ ...FICHIER.reseaux, '050000558': { '8847': tous(0.3) } })
    const s = serieReseaux(deux, ['050000645', '050000558'], '8847')!
    expect(s.map((m) => m.max)).toEqual([0.3, 0.3, 0.459, 0.351, 0.316, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3])
    expect(resumeSerie(s)).toMatchObject({ analyses: 54, depassements: 15 })
    expect(serieReseaux(deux, ['099999999'], '8847')).toBeNull()
  })
  it('échelle : la limite toujours visible, graduations rondes', () => {
    expect(echelleSerie(45.9, 50)).toEqual({ haut: 60, graduations: [20, 40, 60] })
    expect(echelleSerie(0.459, 0.1)).toEqual({ haut: 0.6, graduations: [0.2, 0.4, 0.6] })
    expect(echelleSerie(1.409, 0.5)).toEqual({ haut: 2, graduations: [0.5, 1, 1.5, 2] })
    expect(echelleSerie(0.004, 0.1)).toEqual({ haut: 0.15, graduations: [0.05, 0.1, 0.15] })
    expect(echelleSerie(null, null)).toEqual({ haut: 1, graduations: [0.25, 0.5, 0.75, 1] })
  })
})

describe('phraseSerie', () => {
  const ESPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
  const net = (s: string) => s.replace(ESPACES, ' ')
  it('ASSELINERIE et Rennes en 2025 ; une année sans analyse', () => {
    expect(net(phraseSerie(serieAnnee(FICHIER, '050000645', '8847')!, 2025, 'µg/L'))).toBe(
      '42 analyses en 2025, dont 15 au-dessus de la limite, sur 8 mois ; maximum 0,459 µg/L en mars.',
    )
    expect(net(phraseSerie(serieAnnee(FICHIER, '035004230', '1340')!, 2025, 'mg/L'))).toBe('454 analyses en 2025, aucune au-dessus de la limite ; maximum 45,9 mg/L en août.')
    expect(phraseSerie([{ mois: '2025-01', max: null, analyses: 0, depassements: 0 }], 2025, 'mg/L')).toBe('Aucune analyse en 2025.')
  })
  it('sans valeur quantifiée ; sans limite de qualité, rien sur les dépassements', () => {
    const zero = serieAnnee(fichier({ R: { '6276': tous(0) } }), 'R', '6276')!
    expect(net(phraseSerie(zero, 2025, 'µg/L'))).toBe('12 analyses en 2025, aucune au-dessus de la limite ; aucune valeur quantifiée.')
    expect(net(phraseSerie(serieAnnee(FICHIER, '035004230', '1340')!, 2025, 'mg/L', false))).toBe('454 analyses en 2025 ; maximum 45,9 mg/L en août.')
  })
  it('année en cours : « depuis le 1er janvier », jamais « en 2026 » (règle des années, 2026-10-06)', () => {
    declarerPartiels([2025])
    try {
      expect(net(phraseSerie(serieAnnee(FICHIER, '035004230', '1340')!, 2025, 'mg/L'))).toBe(
        '454 analyses depuis le 1er janvier 2025, aucune au-dessus de la limite ; maximum 45,9 mg/L en août.',
      )
      expect(phraseSerie([{ mois: '2025-01', max: null, analyses: 0, depassements: 0 }], 2025, 'mg/L')).toBe('Aucune analyse depuis le 1er janvier 2025.')
    } finally {
      declarerPartiels([])
    }
  })
})

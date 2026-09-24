import { describe, expect, it } from 'vitest'
import { fmt } from './data'
import {
  causeInstrument,
  instrument,
  instrumentsReseau,
  lectureTaux,
  niceCeil,
  NON_ANALYSEE,
  sansFranchir,
  valeurCoherente,
  valeursReseau,
  type Reglette,
} from './instruments'
import type { CommuneYearStats, Famille, ParamInfo } from './types'

const NB = String.fromCharCode(0xa0)
const p = (l: string, u: string, lim: string, f: Famille): ParamInfo => ({ l, u, lim, ref: null, f, n: 0, nd: 0, nr: 0, nq: 0, a: [], k: null })
const PARAMS: Record<string, ParamInfo> = {
  '1340': p('Nitrates (en NO3)', 'mg/L', '<=50 mg/L', 'azote'),
  '8847': p('Somme de 20 substances perfluoroalkylées (PFAS)', 'µg/L', '<=0,1 µg/L', 'pfas'),
  '6276': p('Total des pesticides analysés', 'µg/L', '<=0,5 µg/L', 'pesticides'),
  '6378': p('Chloridazone desphényl', 'µg/L', '<=0,1 µg/L', 'pesticides'),
  '6379': p('Chloridazone méthyl desphényl', 'µg/L', '<=0,1 µg/L', 'pesticides'),
  '1449': p('Escherichia coli /100ml - MF', 'n/(100mL)', '<=0 n/(100mL)', 'microbio'),
  '6455': p('Entérocoques /100ml-MS', 'n/(100mL)', '<=0 n/(100mL)', 'microbio'),
}

// Statistiques 2025 publiées (dept/<dd>.json, reseaux[r].stats['2025']), réduites aux champs lus.
/** Rennes, réseau 035004230, code « 02000 » : nitrates entre 40 et 50 mg/L, le reste conforme. */
const RENNES: CommuneYearStats = {
  plv: [458, 0, 456, 0, 458, 0, 4],
  fam: {},
  cle: { '1340': [454, 0, 0, 454, 45.9, 18.777, 26.1, '2025-12-29'], '8847': [17, 0, 0, 8, 0.017, 0.002, 0, '2025-12-16'] },
  dep: [],
}
/** Cherbourg-en-Cotentin, réseau ASSELINERIE 050000645, code « 01200 » : restriction pour les PFAS. */
const ASSELINERIE: CommuneYearStats = {
  plv: [63, 0, 13, 15, 63, 0, 0],
  fam: {},
  cle: { '1340': [13, 0, 0, 13, 27.3, 14.331, 12.3, '2025-12-17'], '8847': [42, 15, 0, 26, 0.459, 0.092, 0.003, '2025-12-29'] },
  dep: [['8847', 42, 15, 0, 26, 0.459, 0.092, 0.003, '2025-12-29']],
}
/** Fonsorbes, réseau 031004043, code « 0--30 » : consigne d'ébullition, nitrates et PFAS non analysés. */
const FONSORBES: CommuneYearStats = {
  plv: [168, 1, 168, 0, 168, 2, 16],
  fam: {},
  cle: {},
  dep: [['1449', 168, 1, 0, 1, 2, 0.012, 0, '2025-12-24']],
}
/** Reims, réseau 051000885, code « 22010 » : pesticides plus de 30 jours, un prélèvement non conforme sur 379. */
const REIMS: CommuneYearStats = {
  plv: [380, 1, 379, 3, 366, 3, 13],
  fam: {},
  cle: { '1340': [366, 0, 0, 366, 41, 34.425, 36.2, '2025-12-23'], '8847': [2, 0, 0, 2, 0.005, 0.003, 0.001, '2025-05-27'] },
  dep: [
    ['6378', 18, 17, 0, 17, 1.13, 0.352, 0.261, '2025-12-23'],
    ['6276', 18, 8, 0, 18, 1.409, 0.493, 0.519, '2025-12-23'],
    ['6379', 18, 4, 0, 17, 0.222, 0.071, 0.051, '2025-12-23'],
    ['6455', 379, 1, 0, 1, 1, 0.003, 0, '2025-12-23'],
  ],
}

const reglette = (e: unknown) => e as Reglette

describe('instruments des réseaux de la maquette', () => {
  it('Rennes : chaque valeur sur son échelle officielle', () => {
    const [pesticides, nitrates, pfas, bacterio, metaux] = instrumentsReseau(RENNES, '02000', PARAMS)
    expect(nitrates).toMatchObject({
      famille: 'azote',
      classe: 2,
      ton: 'good',
      libelle: 'maximum de 40 à 50 mg/L',
      echelle: { forme: 'reglette', min: 0, max: 60, limite: 50, reperes: [25, 40, 50], horsLimite: [50, 60], valeur: 45.9, lecture: `45,9${NB}mg/L` },
    })
    expect(reglette(nitrates.echelle).graduations.map((g) => g.t)).toEqual(['0', '25', '40', '50', '60'])
    expect(pfas).toMatchObject({ classe: 0, ton: 'good', echelle: { max: 0.15, limite: 0.1, horsLimite: [0.1, 0.15], valeur: 0.017, lecture: `0,017${NB}µg/L` } })
    expect(reglette(pfas.echelle).graduations.map((g) => g.t)).toEqual(['0', '0,1', '0,15'])
    expect(bacterio).toMatchObject({
      classe: 0,
      libelle: 'tous les prélèvements conformes',
      prelevements: { nonConformes: 0, evalues: 456 },
      echelle: { min: 90, max: 100, limite: 95, horsLimite: [90, 95], valeur: 100, lecture: `100${NB}%` },
    })
    expect(reglette(bacterio.echelle).graduations.map((g) => g.t)).toEqual([`90${NB}%`, `95${NB}%`, `100${NB}%`])
    expect(pesticides).toMatchObject({ classe: 0, ton: 'good', libelle: 'conforme toute l’année', enCause: [], echelle: { forme: 'paliers', actif: 0 } })
    expect(metaux.echelle).toEqual({
      forme: 'paliers',
      actif: 0,
      classes: [
        { t: 'Conforme', ton: 'good' },
        { t: 'Dépassement', ton: 'warn' },
        { t: 'Restriction', ton: 'bad' },
      ],
    })
  })

  it('ASSELINERIE : la restriction PFAS garde son repère, et nomme la somme des 20 PFAS', () => {
    const [, nitrates, pfas, bacterio] = instrumentsReseau(ASSELINERIE, '01200', PARAMS)
    expect(pfas).toMatchObject({ classe: 2, ton: 'bad', libelle: 'restriction de consommation', echelle: { max: 0.6, valeur: 0.459, lecture: `0,459${NB}µg/L` } })
    expect(pfas.enCause).toEqual([
      { code: '8847', libelle: 'Somme de 20 substances perfluoroalkylées (PFAS)', analyses: 42, depassements: 15, max: 0.459, unite: 'µg/L', limite: '<=0,1 µg/L' },
    ])
    expect(nitrates).toMatchObject({ classe: 1, ton: 'good', echelle: { valeur: 27.3, lecture: `27,3${NB}mg/L` } })
    expect(bacterio).toMatchObject({ classe: 0, prelevements: { nonConformes: 0, evalues: 13 } })
  })

  it('Fonsorbes : consigne avec 99,4 % de conformes, familles non analysées sans repère', () => {
    const [, nitrates, pfas, bacterio] = instrumentsReseau(FONSORBES, '0--30', PARAMS)
    expect(bacterio).toMatchObject({
      classe: 3,
      ton: 'bad',
      libelle: "consigne d'ébullition ou restriction",
      prelevements: { nonConformes: 1, evalues: 168 },
      echelle: { min: 90, lecture: `99,4${NB}%` },
    })
    expect(reglette(bacterio.echelle).valeur).toBeCloseTo(99.405, 3)
    expect(bacterio.enCause.map((x) => [x.code, x.depassements, x.analyses])).toEqual([['1449', 1, 168]])
    for (const i of [nitrates, pfas]) {
      expect(i).toMatchObject({ classe: null, ton: null, libelle: NON_ANALYSEE, echelle: { valeur: null, lecture: null } })
    }
    expect(nitrates.echelle).toMatchObject({ max: 60 })
    expect(pfas.echelle).toMatchObject({ max: 0.15 })
  })

  it('Reims : paliers des pesticides et paramètres en cause, du plus au moins souvent', () => {
    const [pesticides, nitrates, pfas, bacterio] = instrumentsReseau(REIMS, '22010', PARAMS)
    expect(pesticides).toMatchObject({ classe: 2, ton: 'warn', libelle: 'dépassements plus de 30 jours', echelle: { forme: 'paliers', actif: 2 } })
    expect(pesticides.echelle).toMatchObject({
      classes: [
        { t: 'Conforme', ton: 'good' },
        { t: '30 jours au plus', ton: 'warn' },
        { t: 'Plus de 30 jours', ton: 'warn' },
        { t: 'Restriction', ton: 'bad' },
      ],
    })
    expect(pesticides.enCause.map((x) => [x.libelle, x.depassements, x.analyses])).toEqual([
      ['Chloridazone desphényl', 17, 18],
      ['Total des pesticides analysés', 8, 18],
      ['Chloridazone méthyl desphényl', 4, 18],
    ])
    expect(bacterio).toMatchObject({ classe: 1, ton: 'good', echelle: { lecture: `99,7${NB}%` } })
    expect(bacterio.enCause.map((x) => x.code)).toEqual(['6455'])
    expect(nitrates.echelle).toMatchObject({ valeur: 41, lecture: `41,0${NB}mg/L` })
    expect(pfas.echelle).toMatchObject({ valeur: 0.005, lecture: `0,005${NB}µg/L` })
  })

  it('sans statistiques ni code : cinq familles non analysées, échelles nues', () => {
    const tous = instrumentsReseau(undefined, null, PARAMS)
    expect(tous.map((i) => i.famille)).toEqual(['pesticides', 'azote', 'pfas', 'microbio', 'metaux_mineraux'])
    expect(tous.every((i) => i.classe == null && i.ton == null && i.libelle === NON_ANALYSEE)).toBe(true)
    expect(tous.map((i) => (i.echelle.forme === 'reglette' ? i.echelle.valeur : i.echelle.actif))).toEqual([null, null, null, null, null])
  })
})

describe('ligne « en cause » sous les instruments', () => {
  const causes = (s: CommuneYearStats, code: string) => instrumentsReseau(s, code, PARAMS).map(causeInstrument)

  it('Rennes : rien à dire', () => {
    expect(causes(RENNES, '02000')).toEqual([null, null, null, null, null])
  })
  it('Reims : le premier paramètre en cause et le reste au détail ; un prélèvement non conforme', () => {
    const [pesticides, nitrates, , bacterio] = causes(REIMS, '22010')
    expect(pesticides).toEqual({ gras: 'Chloridazone desphényl', texte: `17 analyses sur 18 au-dessus de la limite, au plus 1,13${NB}µg/L. 2 autres paramètres au détail.` })
    expect(nitrates).toBeNull()
    expect(bacterio).toEqual({ gras: null, texte: '1 prélèvement non conforme sur 379.' })
  })
  it('ASSELINERIE : la somme des 20 PFAS, seule en cause', () => {
    expect(causes(ASSELINERIE, '01200')[2]).toEqual({
      gras: 'Somme de 20 substances perfluoroalkylées (PFAS)',
      texte: `15 analyses sur 42 au-dessus de la limite, au plus 0,459${NB}µg/L.`,
    })
  })
  it('Fonsorbes : la consigne vient de l’ARS, même à 99,4 % de conformes', () => {
    const [, nitrates, pfas, bacterio] = causes(FONSORBES, '0--30')
    expect(bacterio).toEqual({ gras: null, texte: '1 prélèvement non conforme sur 168. Consigne ou restriction décidée par l’ARS.' })
    expect([nitrates, pfas]).toEqual([null, null])
    const sansEchec = instrumentsReseau({ ...FONSORBES, plv: [168, 0, 168, 0, 168, 0, 16] }, '0--30', PARAMS)[3]
    expect(causeInstrument(sansEchec)).toEqual({ gras: null, texte: 'Consigne ou restriction décidée par l’ARS.' })
  })
})

describe('garde de cohérence', () => {
  it('pas de repère quand la valeur ne mène pas à la classe du code', () => {
    const v = valeursReseau(RENNES, PARAMS)
    expect(valeurCoherente('azote', 2, v)).toBe(true)
    expect(valeurCoherente('azote', 3, v)).toBe(false) // 45,9 mg/L ne dépasse pas 50
    expect(valeurCoherente('pfas', 1, v)).toBe(false) // 0,017 µg/L : le dépassement viendrait d'ailleurs
    expect(valeurCoherente('microbio', 2, v)).toBe(false) // 100 % de conformes
    expect(valeurCoherente('microbio', null, v)).toBe(false)
    const [, nitrates] = instrumentsReseau(RENNES, '03000', PARAMS)
    expect(nitrates).toMatchObject({ classe: 3, ton: 'warn', echelle: { valeur: null, lecture: null, max: 60 } })
  })

  it('la part décidée par l’ARS : restriction PFAS sur dépassement mesuré, consigne quel que soit le taux', () => {
    expect(valeurCoherente('pfas', 2, valeursReseau(ASSELINERIE, PARAMS))).toBe(true)
    expect(valeurCoherente('pfas', 2, valeursReseau(RENNES, PARAMS))).toBe(false)
    expect(valeurCoherente('microbio', 3, valeursReseau(RENNES, PARAMS))).toBe(true)
  })
})

describe('échelles et lectures', () => {
  const v = valeursReseau(RENNES, PARAMS)

  it('les échelles s’étendent quand la valeur l’exige', () => {
    expect(instrument('azote', 3, { ...v, nitratesMax: 87 }).echelle).toMatchObject({ max: 100, horsLimite: [50, 100], lecture: `87,0${NB}mg/L` })
    expect(instrument('microbio', 2, { ...v, bacterio: { nonConformes: 9, evalues: 20 } }).echelle).toMatchObject({
      min: 55,
      horsLimite: [55, 95],
      valeur: 55,
      lecture: `55,0${NB}%`,
    })
    expect(instrument('pfas', 1, { ...v, pfasMax: 1.21 }).echelle).toMatchObject({ max: 1.5, lecture: `1,21${NB}µg/L` })
  })

  it('niceCeil arrondit vers le haut sur 1, 1,5, 2, 3, 5, 6 ou 10 × 10^k', () => {
    expect([0.15, 0.5508, 0.061, 1.21, 7, 100].map(niceCeil)).toEqual([0.15, 0.6, 0.1, 1.5, 10, 100])
  })

  it('une lecture ne franchit jamais un seuil à l’arrondi', () => {
    const lecture = (e: unknown) => reglette(e).lecture
    expect(lecture(instrument('azote', 3, { ...v, nitratesMax: 50.04 }).echelle)).toBe(`50,04${NB}mg/L`)
    expect(lecture(instrument('azote', 2, { ...v, nitratesMax: 50 }).echelle)).toBe(`50,0${NB}mg/L`)
    expect(lecture(instrument('azote', 1, { ...v, nitratesMax: 25.04 }).echelle)).toBe(`25,04${NB}mg/L`)
    expect(lecture(instrument('pfas', 1, { ...v, pfasMax: 0.1004 }).echelle)).toBe(`0,1004${NB}µg/L`)
    expect(sansFranchir(40.96, [40], (d) => fmt.dec(40.96, d), 1)).toBe('41,0')
  })

  it('le taux de conformes est tronqué : 100 % seulement sans aucun échec', () => {
    expect(lectureTaux(0, 456)).toBe(`100${NB}%`)
    expect(lectureTaux(1, 2000)).toBe(`99,9${NB}%`)
    expect(lectureTaux(1, 20)).toBe(`95,0${NB}%`)
    expect(lectureTaux(1, 19)).toBe(`94,7${NB}%`)
  })

  it('limite PFAS lue dans params, 0,1 µg/L à défaut ; familles hors bulletin écartées', () => {
    expect(v.limitePfas).toBe(0.1)
    expect(valeursReseau(RENNES, { ...PARAMS, '8847': p('Somme de 20 PFAS', 'µg/L', '<=0,07 µg/L', 'pfas') }).limitePfas).toBe(0.07)
    expect(valeursReseau(RENNES, {}).limitePfas).toBe(0.1)
    const ph = { ...RENNES, dep: [['1302', 10, 2, 0, 10, 9.5, 8, 8, '2025-01-01']] as CommuneYearStats['dep'] }
    expect(valeursReseau(ph, { ...PARAMS, '1302': p('pH', 'unité pH', '>=6,5 et <=9 unité pH', 'physico_chimie') }).enCause).toEqual({})
  })
})

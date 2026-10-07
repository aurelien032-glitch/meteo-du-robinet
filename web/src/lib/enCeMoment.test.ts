import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fmt } from './data'
import { avisMoment, dernierPrelevement, ligneAvis, MENTION_PRUDENCE, phraseAvis, resultatsMoment, type DonneesMoment } from './enCeMoment'
import { declarerPartiels } from './situations'
import type { AvisDeptFile, CommuneYearStats } from './types'

// Formulations réelles de l'Aisne (avis/02.json, 2026), texte abrégé.
const TEXTES: AvisDeptFile['textes'] = {
  '1239': { c: 'sensibles', k: ['perchlorates'], l: false, t: 'Présence de perchlorates >4 µg/l et <15 µg/l,  la consommation de l’eau est déconseillée aux nourrissons de moins de 6 mois.' },
  '3478': { c: 'sensibles', k: ['perchlorates'], l: false, t: 'Eau d’alimentation conforme aux limites de qualité en vigueur. Présence de perchlorates.' },
  '3772': { c: 'interdiction', k: ['plomb'], l: true, t: 'Eau déconseillée dans le bâtiment concerné.' },
  '9001': { c: 'ebullition', k: ['bactériologie'], l: false, t: 'Faire bouillir l’eau avant consommation.' },
}
const stats = (plv: number, depassements = 0, dlast = '2026-07-17') =>
  ({
    plv: [plv, 0, plv, 0, plv, 0, 0],
    fam: { pesticides: [100, depassements, 0, 4] },
    cle: { '1340': [10, 0, 0, 10, 47.7, 43, 43, dlast] },
    dep: [],
  }) as unknown as CommuneYearStats

const donnees = (o: Partial<DonneesMoment> = {}): DonneesMoment => ({
  annee: '2026',
  arret: '2026-07-31',
  lignes: [],
  textes: TEXTES,
  derniers: {},
  sansInfo: null,
  stats: stats(64),
  reseaux: [
    { code: '002001708', nom: 'Haut service', situation: '220000' },
    { code: '002001716', nom: 'Bas service', situation: '220200' },
  ],
  lieu: 'à Saint-Quentin',
  ...o,
})

beforeEach(() => declarerPartiels([2026]))
afterEach(() => declarerPartiels([]))

describe('« En ce moment » : avis de l’ARS de l’année en cours', () => {
  it('avis présents : la catégorie la plus grave, attribuée à l’ARS, datée, citée', () => {
    const a = avisMoment(
      donnees({
        lignes: [
          ['2026-07-17', 1239, '002001708'],
          ['2026-06-19', 3478, '002001716'],
          ['2026-03-02', 9001, '002001716'],
          ['2026-07-20', 3772, '002001716'],
        ],
        derniers: { '002001708': '2026-07-17', '002001716': '2026-06-19' },
      }),
    )
    expect(a.etat).toBe('avis')
    if (a.etat !== 'avis') return
    // L'ébullition est plus grave que les publics sensibles ; l'avis limité à un bâtiment n'entre pas.
    expect(a.cat).toBe('ebullition')
    expect(a.phrase).toBe("Les conclusions de l’ARS de 2026 mentionnent une consigne d'ébullition.")
    expect(a.periode).toBe('Mention relevée sur le réseau Bas service, le 02/03/2026, avis absent des prélèvements suivants du réseau, jusqu’au 19/06/2026.')
    // Absente des prélèvements suivants : neutre (règle du 25/09).
    expect(a.ton).toBeNull()
    expect(a.citation).toEqual({ texte: 'Faire bouillir l’eau avant consommation.', date: '2026-03-02', reseau: 'Bas service' })
    expect(a.autres).toEqual([
      'Les conclusions mentionnent aussi une eau déconseillée aux publics sensibles. Mention relevée sur les réseaux Haut service et Bas service, du 19/06/2026 au 17/07/2026, avis repris jusqu’au dernier prélèvement connu de l’un des réseaux.',
    ])
  })
  it('la dernière conclusion est citée, espaces réduites, avec son réseau', () => {
    const a = avisMoment(donnees({ lignes: [['2026-07-17', 1239, '002001708'], ['2026-01-09', 3478, '002001716']], derniers: { '002001708': '2026-07-17' } }))
    if (a.etat !== 'avis') throw new Error(a.etat)
    expect(a.phrase).toBe(phraseAvis('sensibles', '2026'))
    expect(a.phrase).toBe('Les conclusions de l’ARS de 2026 mentionnent une eau déconseillée aux publics sensibles.')
    expect(a.ton).toBe('warn')
    expect(a.citation?.texte).toBe('Présence de perchlorates >4 µg/l et <15 µg/l, la consommation de l’eau est déconseillée aux nourrissons de moins de 6 mois.')
    expect(a.citation?.reseau).toBe('Haut service')
  })
  it('un seul réseau : la période ne le nomme pas', () => {
    const a = avisMoment(donnees({ lignes: [['2026-07-17', 1239, '002001708']], reseaux: [{ code: '002001708', nom: 'Haut service', situation: '220000' }] }))
    if (a.etat !== 'avis') throw new Error(a.etat)
    expect(a.periode).toBe('Mention relevée le 17/07/2026.')
  })
  it('les avis des années passées n’y entrent pas', () => {
    expect(avisMoment(donnees({ lignes: [['2025-11-02', 1239, '002001708']] })).etat).toBe('aucun')
  })
  it('département sans information : jamais « aucun avis »', () => {
    const a = avisMoment(donnees({ sansInfo: { conclusions: 1196, lieux: 'de l’Ille-et-Vilaine' } }))
    expect(a.etat).toBe('sans-information')
    if (a.etat !== 'sans-information') return
    expect(a.phrase).toBe('Aucune consigne ne figure dans les conclusions publiées.')
    expect(a.explication).toContain(`aucune des ${fmt.int(1196)} conclusions de l’ARS sur les réseaux de l’Ille-et-Vilaine n’évoque de consigne`)
    expect(a.explication).toContain('La mairie et l’ARS font foi.')
    expect(JSON.stringify(a)).not.toMatch(/aucun avis/i)
  })
  it('aucun avis : une phrase datée, attribuée aux conclusions de l’ARS', () => {
    expect(avisMoment(donnees())).toEqual({ etat: 'aucun', phrase: 'Aucune consigne ne figure dans les conclusions de l’ARS depuis le 1er janvier 2026.' })
  })
  it('année en cours sans données : rien d’inventé', () => {
    expect(avisMoment(donnees({ stats: undefined })).etat).toBe('sans-donnees')
    expect(avisMoment(donnees({ stats: undefined }))).toEqual({
      etat: 'sans-donnees',
      phrase: 'Aucun prélèvement de 2026 n’est publié à Saint-Quentin.',
      explication: 'Aucune conclusion de l’ARS de l’année ne peut donc être rapportée.',
    })
    expect(avisMoment(donnees({ annee: undefined })).phrase).toBe('Les données de l’année en cours ne sont pas encore publiées.')
  })
  it('la mention de prudence : aucune recommandation, la mairie et l’ARS font foi', () => {
    expect(MENTION_PRUDENCE).toContain('ne formule aucune recommandation sanitaire')
    expect(MENTION_PRUDENCE).toContain('la mairie et l’ARS font foi')
  })
})

describe('« En ce moment » : derniers résultats de l’année en cours', () => {
  it('une ligne par famille en cause, non conformes puis réserves, avec les réseaux concernés', () => {
    const r = resultatsMoment(donnees())
    expect(r.etat).toBe('familles')
    if (r.etat !== 'familles') return
    expect(r.lignes.map((l) => [l.famille, l.ton, l.texte])).toEqual([
      ['pesticides', 'warn', 'Pesticides et métabolites : dépassements plus de 30 jours (réseaux Haut service et Bas service).'],
      ['microbio', 'warn', 'Bactériologie : plus de 5 % de prélèvements non conformes (réseau Bas service).'],
      ['azote', 'good', 'Nitrates : maximum de 40 à 50 mg/L (réseaux Haut service et Bas service).'],
    ])
    expect(r.prelevements).toBe(64)
    expect(r.dernier).toBe('2026-07-17')
  })
  it('rien au-dessus d’une limite : la phrase, avec le nombre de prélèvements', () => {
    const r = resultatsMoment(donnees({ reseaux: [{ code: 'x', nom: 'X', situation: '000000' }] }))
    expect(r).toEqual({ etat: 'sans-ecart', phrase: 'Aucun résultat au-dessus d’une limite de qualité depuis le 1er janvier (64 prélèvements).', dernier: '2026-07-17' })
  })
  it('un dépassement hors du jugement (canalisations) : la phrase du verdict, jamais « aucun résultat »', () => {
    const r = resultatsMoment(donnees({ stats: stats(12, 1), reseaux: [{ code: 'x', nom: 'X', situation: '000000' }] }))
    expect(r.etat).toBe('sans-ecart')
    if (r.etat === 'sans-ecart') expect(r.phrase).toBe('Eau conforme depuis le 1er janvier 2026 pour les 6 familles analysées (12 prélèvements).')
  })
  it('année en cours sans prélèvement : le dire', () => {
    expect(resultatsMoment(donnees({ stats: undefined }))).toEqual({ etat: 'sans-donnees', phrase: 'Aucun prélèvement du contrôle sanitaire n’est publié à Saint-Quentin depuis le 1er janvier 2026.' })
  })
  it('date du dernier prélèvement : la plus récente des analyses', () => {
    const s = stats(3)
    s.dep = [['6276', 5, 5, 0, 5, 5, 2, 1, '2026-07-20']]
    expect(dernierPrelevement(s)).toBe('2026-07-20')
    expect(dernierPrelevement(undefined)).toBeNull()
  })
})

describe('ligne de l’avis de la carte « Qualité de l’eau » (maquette du 2026-10-06)', () => {
  const sp = (t: string) => t.replace(/\u00a0/g, ' ')
  // Texte réel de l'ARS (Aisne, perchlorates), coupé comme dans SISE.
  const texte = 'Présence de perchlorates à 15 µg/l la consommation de l’eau est déconseillée aux nourris sons de moins de 6 mois et aux femmes enceint es.'
  it('nomme le public visé, la cause et la période des conclusions, jamais la durée de la mesure', () => {
    expect(sp(ligneAvis({ cat: 'sensibles', debut: '2026-01-05', fin: '2026-07-17', causes: ['perchlorates'], textes: [texte] }))).toBe(
      'L’ARS a déconseillé l’eau aux nourrissons de moins de 6 mois et aux femmes enceintes (perchlorates) dans ses conclusions du 5 janvier au 17 juillet 2026.',
    )
  })
  it('sans public nommé, les publics sensibles ; une seule conclusion, sa date', () => {
    expect(sp(ligneAvis({ cat: 'sensibles', debut: '2026-07-01', fin: '2026-07-01', causes: [], textes: ['Eau non conforme.'] }))).toBe(
      'L’ARS a déconseillé l’eau aux publics sensibles dans sa conclusion du 1er juillet 2026.',
    )
  })
  it('consigne d’ébullition et restriction de consommation', () => {
    expect(sp(ligneAvis({ cat: 'ebullition', debut: '2025-12-20', fin: '2026-02-03', causes: ['bactériologie'], textes: [] }))).toBe(
      'L’ARS a demandé de faire bouillir l’eau avant consommation (bactériologie) dans ses conclusions du 20 décembre 2025 au 3 février 2026.',
    )
    expect(sp(ligneAvis({ cat: 'interdiction', debut: '2026-03-02', fin: '2026-03-30', causes: ['nitrates', 'pesticides'], textes: [] }))).toBe(
      'L’ARS a restreint la consommation de l’eau (nitrates et pesticides) dans ses conclusions du 2 mars au 30 mars 2026.',
    )
  })
})

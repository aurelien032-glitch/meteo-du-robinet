import { afterEach, describe, expect, it } from 'vitest'
import { avisSimple, casesEau, categorieCalco, categorieDurete, phraseNote } from './monEau'
import { declarerPartiels } from './situations'
import type { CommuneYearStats, ParamInfo, ParamRec } from './types'

// Ordre des familles d'un code de situation : pesticides, azote, pfas, microbio, metaux_mineraux, autres.
const rec = (n: number, nd: number, max: number | null, moy: number | null): ParamRec => [n, nd, 0, n, max, moy, null, null]

const stats = (o: Partial<CommuneYearStats> = {}): CommuneYearStats => ({
  plv: [50, 0, 47, 0, 40, 0, 0],
  fam: {},
  cle: { '6276': rec(12, 4, 3.5, 0.6), '8847': rec(3, 0, 0.007, 0.004), '1345': rec(10, 0, 35, 32.4), '1398': rec(1, 0, 0.25, 0.25) },
  dep: [['1340', ...rec(47, 2, 55.2, 38)]],
  ...o,
})

const params = { '1369': { l: 'Arsenic', f: 'metaux_mineraux' }, '1382': { l: 'Plomb', f: 'metaux_mineraux' }, '8865': { l: 'Chlorothalonil R471811', f: 'pesticides' }, '6854': { l: 'ESA metolachlore', f: 'pesticides' }, '6865': { l: 'Diméthénamide ESA', f: 'pesticides' }, '1907': { l: 'AMPA', f: 'pesticides' } } as unknown as Record<string, ParamInfo>
const prix = { prix: 2.73, annee: '2024' }

afterEach(() => declarerPartiels([]))

describe('casesEau', () => {
  it('dureté : catégories des synthèses de l’ARS, bornes hautes exclues, sur la valeur affichée', () => {
    expect([0, 9.94, 9.96, 10, 19.9, 20, 29.94, 30, 49.3].map(categorieDurete)).toEqual([
      'Eau douce', 'Eau douce', 'Eau peu calcaire', 'Eau peu calcaire', 'Eau peu calcaire', 'Eau dure', 'Eau dure', 'Eau très dure', 'Eau très dure',
    ])
  })

  it('pH : catégorie de l’équilibre calcocarbonique (5907), réponse quand l’eau est agressive, précision sinon', () => {
    expect([0, 1.4, 1.5, 2.6, 4].map(categorieCalco)).toEqual(['Eau incrustante', 'Eau légèrement incrustante', 'Eau à l’équilibre', 'Eau légèrement agressive', 'Eau agressive'])
    const ph = (moy: number) =>
      casesEau({ situation: '000000', stats: stats({ cle: { ...stats().cle, '1302': [30, 0, 0, 30, 7.9, 7.4, null, null], '5907': rec(5, 0, 4, moy) } }), params, annee: '2025', prix }).find((c) => c.cle === 'ph')!
    expect(ph(2.6)).toMatchObject({ etat: 'neutre', reponse: 'Eau légèrement agressive', precision: 'pH 7,4 en moyenne' })
    expect(ph(2)).toMatchObject({ etat: 'neutre', reponse: '7,4 en moyenne', precision: 'eau à l’équilibre' })
    expect(ph(2.6).explication.join(' ')).toMatch(/noté en moyenne 2,6 sur 5 mesures, soit une eau légèrement agressive\./)
  })

  it('chlore et fluor : informations des synthèses de l’ARS, citées et attribuées', () => {
    const s = stats({ cle: { ...stats().cle, '7073': rec(2, 0, 0.12, 0.1) } })
    const parCle = Object.fromEntries(casesEau({ situation: '000000', stats: s, params, annee: '2025', prix }).map((c) => [c.cle, c]))
    expect(parCle.chlo.explication.join(' ')).toMatch(/Plusieurs ARS indiquent dans leurs synthèses annuelles.*«.Pour éliminer le goût de chlore/)
    expect(parCle.fluor.explication.join(' ')).toMatch(/synthèses annuelles de l’ARS précisent.*«.Avant d’envisager un apport complémentaire en fluor/)
  })

  it('répond à chaque question d’habitant, en trois groupes et dans l’ordre de la fiche ; pas de case pour le plomb', () => {
    const cases = casesEau({ situation: '230000', stats: stats(), params, annee: '2025', prix })
    expect(cases.map((c) => c.cle)).toEqual(['bact', 'pest', 'nitr', 'pfas', 'aspect', 'calc', 'chlo', 'ph', 'fluor', 'controles', 'sanslimite', 'prix'])
    expect(cases.map((c) => c.groupe)).toEqual(['note', 'note', 'note', 'note', 'quotidien', 'quotidien', 'quotidien', 'quotidien', 'quotidien', 'aussi', 'aussi', 'aussi'])
    const parCle = Object.fromEntries(cases.map((c) => [c.cle, c]))
    expect(parCle.controles).toMatchObject({ etat: 'neutre', reponse: '50 prélèvements' })
    expect(parCle.bact).toMatchObject({ etat: 'bon', reponse: 'Aucune trouvée', precision: '47 contrôles' })
    expect(parCle.pest).toMatchObject({ etat: 'alerte', reponse: 'Limite dépassée plus d’un mois', precision: 'total au plus 3,5 µg/L' })
    expect(parCle.nitr).toMatchObject({ etat: 'alerte', reponse: 'Limite dépassée 2 fois', precision: 'sur 47 contrôles' })
    expect(parCle.pfas).toMatchObject({ etat: 'bon', reponse: 'Sous la limite' })
    expect(parCle.calc).toMatchObject({ etat: 'neutre', reponse: 'Eau très dure' })
    expect(parCle.calc.precision.replace(/\u00a0/g, ' ')).toBe('32,4 °f en moyenne')
    expect(parCle.chlo).toMatchObject({ etat: 'neutre', reponse: '0,25 mg/L', precision: '1 mesure' })
    expect(parCle.prix).toMatchObject({ etat: 'neutre', reponse: '2,73 € le m³', precision: 'soit 0,27 centime le litre' })
  })

  it('l’aspect, le pH et le fluor : écarts aux références sans jugement, limite dépassée en alerte', () => {
    const s = stats({ cle: { ...stats().cle, '1295': rec(12, 0, 0.8, 0.2), '1309': rec(12, 0, 5, 2), '1302': [30, 0, 2, 30, 9.3, 7.9, null, null], '7073': rec(2, 0, 0.12, 0.1) } })
    const parCle = Object.fromEntries(casesEau({ situation: '000000', stats: s, params, annee: '2025', prix }).map((c) => [c.cle, c]))
    expect(parCle.aspect).toMatchObject({ etat: 'neutre', reponse: 'Claire, sans couleur', precision: 'turbidité au plus 0,8 NFU' })
    expect(parCle.ph).toMatchObject({ etat: 'neutre', reponse: 'Hors de 6,5 à 9 2 fois', precision: 'sur 30 mesures' })
    expect(parCle.fluor).toMatchObject({ etat: 'bon', reponse: 'Sous la limite', precision: 'au plus 0,12 mg/L' })
    const trouble = stats({ dep: [['1295', ...rec(12, 2, 3.1, 0.5)]] })
    const aspect = casesEau({ situation: '000001', stats: trouble, params, annee: '2025', prix }).find((c) => c.cle === 'aspect')
    expect(aspect).toMatchObject({ etat: 'alerte', reponse: 'Trouble 2 fois' })
  })

  it('l’année sans mesure reprend la dernière du réseau, datée et sans jugement, cinq ans au plus (auteur, 2026-10-06)', () => {
    const net = (s: string) => s.replace(/[  ]/g, ' ')
    declarerPartiels([2026])
    const sans = stats({ cle: { '6276': rec(12, 0, 0.05, 0.02) } })
    const historique = {
      '2025': stats({ cle: { ...stats().cle, '7073': rec(2, 0, 0.12, 0.1) } }),
      '2020': stats({ cle: { '1302': [30, 0, 0, 30, 7.9, 7.4, null, null] } }),
    }
    const parCle = Object.fromEntries(casesEau({ situation: '000000', stats: sans, params, annee: '2026', prix, historique }).map((c) => [c.cle, c]))
    expect(parCle.calc).toMatchObject({ titre: 'Dureté', etat: 'neutre', reponse: 'Eau très dure' })
    expect(net(parCle.calc.precision)).toBe('32,4 °f en moyenne en 2025')
    expect(net(parCle.calc.explication[0])).toBe('Aucune mesure publiée depuis le 1er janvier 2026 ; la valeur affichée est la dernière, de 2025.')
    expect(parCle.chlo).toMatchObject({ titre: 'Chlore', etat: 'neutre', precision: '1 mesure en 2025' })
    // Un résultat d'une autre année ne juge pas celle-ci : « Sous la limite » reste neutre, et daté.
    expect(parCle.fluor).toMatchObject({ etat: 'neutre', reponse: 'Sous la limite' })
    expect(net(parCle.fluor.precision)).toBe('au plus 0,12 mg/L en 2025')
    // Six ans plus tôt : trop ancien, la case dit l'absence de mesure.
    expect(parCle.ph).toMatchObject({ etat: 'absent' })
    // Sans historique (« En ce moment », année en cours seulement), rien n'est repris.
    expect(casesEau({ situation: '000000', stats: sans, params, annee: '2026', prix }).find((c) => c.cle === 'calc')).toMatchObject({ etat: 'absent', reponse: 'Pas mesurée depuis le 1er janvier' })
  })

  it('les substances sans limite : trouvées ou non, toujours neutres', () => {
    const hg = { s: [['6219', 3, 3, 5.9], ['8858', 2, 0, null]] as [string, number, number, number | null][], g: { perchlorate: [1, 1], metabolites: [10, 0] } as CommuneYearStats['hg'] extends infer H ? H extends { g: infer G } ? G : never : never }
    const c = casesEau({ situation: '000000', stats: stats({ hg }), params: { ...params, '6219': { l: 'Perchlorate', f: 'physico_chimie' } } as unknown as Record<string, ParamInfo>, annee: '2025', prix }).find((x) => x.cle === 'sanslimite')
    expect(c).toMatchObject({ etat: 'neutre', reponse: '1 trouvée', precision: 'Perchlorate' })
  })

  it('les pesticides : un métabolite non pertinent est dit hors de la note, à partir de l’année de l’avis de l’Anses', () => {
    const texte = (annee: string) => casesEau({ situation: '000000', stats: stats(), params, annee, prix }).find((c) => c.cle === 'pest')!.explication.join(' ')
    expect(texte('2021')).not.toMatch(/non pertinent/)
    expect(texte('2023')).not.toMatch(/Chlorothalonil/)
    expect(texte('2024')).toMatch(/L’Anses a classé non pertinents les résidus .*Chlorothalonil R471811.*0,9 µg\/L.*ne comptent pas dans la note\./)
  })

  it('dit ce qui n’a pas été cherché, sans le juger', () => {
    const cases = casesEau({ situation: '------', stats: undefined, params, annee: '2025', prix: null })
    expect(cases.every((c) => c.etat === 'absent')).toBe(true)
    expect(cases.find((c) => c.cle === 'pest')?.reponse).toBe('Pas recherchés en 2025')
  })

  it('écrit « depuis le 1er janvier » pour l’année en cours', () => {
    declarerPartiels(['2026'])
    const cases = casesEau({ situation: '------', stats: undefined, params, annee: '2026', prix: null })
    expect(cases.find((c) => c.cle === 'nitr')?.reponse).toBe('Pas mesurés depuis le 1er janvier')
    const pleine = casesEau({ situation: '000000', stats: stats({ dep: [] , cle: { ...stats().cle, '1340': rec(20, 0, 30, 20) } }), params, annee: '2026', prix: null })
    expect(pleine.find((c) => c.cle === 'pest')?.explication).toContain('Depuis le 1er janvier 2026, aucun résultat n’a dépassé la limite.')
    expect(pleine.flatMap((c) => c.explication).join(' ')).not.toMatch(/En 2026/)
  })

  it('ajoute « Autres substances » seulement quand une autre limite est dépassée, sans les paramètres des canalisations', () => {
    expect(casesEau({ situation: '000000', stats: stats(), params, annee: '2025', prix }).some((c) => c.cle === 'autres')).toBe(false)
    const s = stats({ dep: [['1382', ...rec(4, 1, 15, 5)], ['1369', ...rec(4, 2, 14, 9)]] })
    const autres = casesEau({ situation: '000010', stats: s, params, annee: '2025', prix }).find((c) => c.cle === 'autres')
    expect(autres).toMatchObject({ etat: 'alerte', precision: 'Arsenic' })
  })

  it('n’emploie aucun terme réglementaire dans les réponses ni les explications', () => {
    const textes: string[] = []
    for (const code of ['000000', '110100', '230200', '332210', '------', '0-0-0-'])
      for (const c of casesEau({ situation: code, stats: stats(), params, annee: '2025', prix })) textes.push(c.reponse, c.precision, ...c.explication)
    const tout = textes.join(' ')
    for (const mot of [/conforme/i, /\bUDI\b/, /param[eè]tre/i, /classe/i, /NC[0-2]/]) expect(tout).not.toMatch(mot)
  })
})

describe('phraseNote', () => {
  it('nomme les familles en cause en mots courants', () => {
    expect(phraseNote({ lettre: 'C', familles: { pesticides: 'C', azote: 'C' }, reportees: [], situation: '230000', annee: '2025' })).toBe(
      'En 2025, des limites ont été dépassées : pesticides et nitrates.',
    )
    expect(phraseNote({ lettre: 'B', familles: { pesticides: 'B' }, reportees: [], situation: '100000', annee: '2025' })).toBe(
      'En 2025, une limite a été dépassée peu de temps : pesticides.',
    )
  })

  it('nomme la réserve d’une bonne note', () => {
    expect(phraseNote({ lettre: 'A', familles: {}, reportees: [], situation: '020000', annee: '2025' })).toBe(
      'Aucune limite dépassée en 2025. Les nitrates restent sous la limite, mais s’en approchent.',
    )
  })

  it('dit la reprise des années précédentes et l’absence de note', () => {
    expect(phraseNote({ lettre: 'C', familles: { pesticides: 'C' }, reportees: ['pesticides'], situation: '000000', annee: '2025' })).toMatch(
      /^Pour les pesticides, la note reprend les résultats des années précédentes\.$/,
    )
    expect(phraseNote({ lettre: null, familles: {}, reportees: [], situation: null, annee: '2025' })).toBe('Pas de note : trop peu d’analyses en 2025.')
  })

  it('ne dit pas « en 2026 » d’un bilan partiel sans dépassement', () => {
    declarerPartiels(['2026'])
    expect(phraseNote({ lettre: 'A', familles: {}, reportees: [], situation: '000000', annee: '2026' })).toBe('Aucune limite dépassée depuis le 1er janvier 2026.')
  })
})

describe('avisSimple', () => {
  const avis = (cat: 'sensibles' | 'ebullition' | 'interdiction') =>
    avisSimple(
      { etat: 'avis', cat, ton: 'warn', phrase: '', periode: '', ligne: 'Ligne.', autres: [], citation: { texte: 'Eau déconseillée aux nourrissons.', date: '2026-07-17', reseau: 'Bas service' } },
      '2026-07-31',
    )

  it('rapporte l’avis au passé, daté et attribué à l’ARS', () => {
    const a = avis('sensibles')
    expect(a).toMatchObject({ ton: 'alerte', titre: 'Avis de l’ARS du 17/07/2026', texte: 'L’ARS a déconseillé la consommation de l’eau à des publics sensibles.' })
    expect(a.citation?.source).toBe('Texte de l’ARS, contrôle du 17/07/2026, Bas service.')
    expect(avis('ebullition').ton).toBe('grave')
    expect(avis('interdiction').texte).toBe('L’ARS a restreint la consommation de l’eau du robinet.')
  })

  it('ne dit jamais qu’un avis est en cours ou en vigueur (l’ARS ne publie pas sa levée)', () => {
    const textes = [
      avis('sensibles'),
      avis('ebullition'),
      avisSimple({ etat: 'sans-information', phrase: '', explication: '' }, '2026-07-31'),
      avisSimple({ etat: 'aucun', phrase: '' }, '2026-07-31'),
    ].flatMap((a) => [a.titre, a.texte, a.suite])
    for (const t of textes) expect(t).not.toMatch(/en cours|en vigueur/)
  })
})

describe('phraseNote : grille bactériologique de l’ARS et PFAS non confirmés (2026-10-05)', () => {
  it('une note D bactériologique ne dit pas de restriction', () => {
    expect(phraseNote({ lettre: 'D', familles: { microbio: 'D' }, reportees: [], situation: '000200', annee: '2025' })).toBe(
      'Des bactéries ont été trouvées dans une part élevée des derniers prélèvements.',
    )
    expect(phraseNote({ lettre: 'D', familles: { pesticides: 'D', microbio: 'D' }, reportees: [], situation: '300200', annee: '2025' })).toBe(
      'En 2025, l’ARS a restreint la consommation de l’eau : pesticides ; des bactéries ont été trouvées dans une part élevée des derniers prélèvements.',
    )
  })
  it('une consigne liée aux bactéries reste dite quand la grille ne la retient pas', () => {
    expect(phraseNote({ lettre: 'A', familles: { microbio: 'A' }, reportees: [], situation: '000300', annee: '2025' })).toBe(
      'Aucun dépassement retenu par la note en 2025. L’ARS a émis une consigne liée aux bactéries en 2025.',
    )
    expect(phraseNote({ lettre: 'A', familles: { microbio: 'A' }, reportees: [], situation: '000200', annee: '2025' })).toBe(
      'Aucun dépassement retenu par la note en 2025. Des bactéries ont été trouvées dans plus de 5 % des prélèvements, une proportion que la grille de l’ARS admet pour ce nombre de prélèvements.',
    )
    expect(phraseNote({ lettre: 'C', familles: { microbio: 'C' }, reportees: [], situation: '000300', annee: '2025' })).toBe(
      'Des bactéries ont été trouvées en quantité notable dans les derniers prélèvements. L’ARS a émis une consigne liée aux bactéries en 2025.',
    )
  })
  it('un dépassement de PFAS isolé n’entre pas dans la note', () => {
    expect(phraseNote({ lettre: 'A', familles: { pfas: 'A' }, reportees: [], situation: '001000', annee: '2025' })).toBe(
      'Aucun dépassement retenu par la note en 2025. Un dépassement isolé de la limite des PFAS, non confirmé dans l’année, n’entre pas dans la note.',
    )
  })
})

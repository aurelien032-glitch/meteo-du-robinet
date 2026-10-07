import { describe, expect, it } from 'vitest'
import {
  comptesClasses,
  comptesSecheresse,
  dateAvis,
  dateBilan,
  PAGES_RESSOURCE,
  partClasse,
  phraseNonClasses,
  phrasePrix,
  phraseSansInformation,
  prixSispea,
  SUJETS_ACCUEIL,
  texteConsignes,
  texteRepartition,
  legendeSecheresse,
  teteSecheresse,
  titreBilan,
  type ComptesClasses,
} from './accueil'
import type { SispeaNationalFile } from './types'
import type { SituationsFile } from './situations'

const situ = (reseaux: Record<string, string>, classes?: Record<string, string>): SituationsFile => ({
  familles: ['pesticides', 'azote', 'pfas', 'microbio', 'metaux_mineraux', 'autres'],
  reseaux,
  classes,
  depts: {},
  national: {},
})

const comptes = (A: number, B: number, C: number, D: number, nonClasses = 0): ComptesClasses => ({ A, B, C, D, classes: A + B + C + D, nonClasses })

describe('comptes par classe (même règle que la fiche : pire lettre du réseau)', () => {
  it('un réseau absent de « classes » est en A ; une minuscule (année antérieure) compte ; sans famille analysée, à part', () => {
    const s = situ(
      { r1: '000000', r2: '0-0000', r3: '100000', r4: '------', r5: '000200', r6: '0-00-0' },
      { r3: 'BAAAAA', r5: 'AAACAD', r6: 'a-cA-A' },
    )
    expect(comptesClasses(s)).toEqual({ A: 2, B: 1, C: 1, D: 1, classes: 5, nonClasses: 1 })
  })
  it('fichier antérieur aux classes : aucun réseau classé', () => {
    expect(comptesClasses(situ({ r1: '000000', r2: '100000' }))).toEqual({ A: 0, B: 0, C: 0, D: 0, classes: 0, nonClasses: 2 })
  })
})

describe('titre et textes de la carte « Bilan »', () => {
  // Comptes réels de 2025 (situations/2025.json, 05/10) : 74,97 % en A.
  const c2025 = comptes(17341, 2202, 3011, 576)
  it('une fraction en toutes lettres seulement à un demi-point près, sinon la part exacte', () => {
    expect(titreBilan(c2025, 2025)).toBe('Trois réseaux sur quatre ont la note A')
    expect(titreBilan(comptes(16652, 2332, 3831, 615), 2023)).toBe('71,1 % des réseaux ont la note A')
    expect(titreBilan(comptes(9, 1, 0, 0), 2025)).toBe('Neuf réseaux sur dix ont la note A')
    expect(titreBilan(comptes(0, 0, 0, 0, 3), 2025)).toBe('Notes non calculées pour 2025')
  })
  it('parts, date et texte équivalent de la barre', () => {
    expect(partClasse(c2025, 'D')).toBeCloseTo(576 / 23130)
    expect(dateBilan(c2025)).toBe('23 130 réseaux · notes calculées par le site')
    expect(texteRepartition(c2025, 2025)).toBe(
      'Répartition des 23 130 réseaux notés en 2025 : A, bonne qualité, 75,0 % ; B, qualité convenable, 9,5 % ; C, qualité insuffisante, 13,0 % ; D, mauvaise qualité, 2,5 %',
    )
  })
  it('réseaux non classés : dits à part, jamais mêlés aux parts', () => {
    expect(phraseNonClasses(c2025)).toBeNull()
    expect(phraseNonClasses(comptes(3, 0, 0, 0, 2))).toBe('2 autres réseaux sans note, faute d’analyse, ne sont pas comptés.')
    expect(phraseNonClasses(comptes(3, 0, 0, 0, 1))).toBe('1 autre réseau sans note, faute d’analyse, n’est pas compté.')
  })
})

describe('carte « En ce moment »', () => {
  it('période de l’année en cours, date d’arrêt', () => {
    expect(dateAvis('2026', true, '2026-07-31')).toBe('depuis le 1er janvier 2026, données arrêtées au 31/07/2026')
    expect(dateAvis('2025', false)).toBe('année 2025')
  })
  it('chiffre accordé ; sans réseau, une phrase sans chiffre', () => {
    const sp = (t: string) => t.replace(/[  ]/g, ' ')
    expect(sp(texteConsignes(314, 26))).toBe('314 réseaux d’eau ont fait l’objet d’une restriction de consommation de l’ARS, et 26 d’une consigne d’ébullition.')
    expect(texteConsignes(1, 0)).toBe('1 réseau d’eau a fait l’objet d’une restriction de consommation de l’ARS ; aucun d’une consigne d’ébullition.')
    expect(texteConsignes(0, 3)).toBe('Aucun réseau d’eau n’a fait l’objet d’une restriction de consommation de l’ARS ; 3 ont reçu une consigne d’ébullition.')
    expect(texteConsignes(0, 0)).toMatch(/^Aucun réseau d’eau n’a fait l’objet d’une restriction de consommation ni d’une consigne d’ébullition/)
  })
  it('départements sans information : dits, jamais « aucun avis »', () => {
    expect(phraseSansInformation(0, '2026', true)).toBeNull()
    expect(phraseSansInformation(31, '2026', true)).toBe(
      'Dans 31 départements, l’ARS ne précise pas ses avis dans les résultats publiés depuis le 1er janvier 2026. L’absence d’avis n’y signifie donc pas qu’il n’y en a pas eu.',
    )
    expect(phraseSansInformation(1, '2025', false)).toMatch(/^Dans un département, l’ARS ne précise pas ses avis dans les résultats publiés en 2025\./)
  })
})

describe('sujets et ressource', () => {
  it('six sujets et cinq pages de la ressource, vers des pages existantes', () => {
    expect(SUJETS_ACCUEIL.map((s) => s.to)).toEqual(['/themes/pfas', '/themes/pesticides', '/themes/nitrates', '/themes/bacteries', '/themes/plomb', '/avis'])
    expect(PAGES_RESSOURCE.map((s) => s.to)).toEqual(['/secheresse', '/nappes', '/ressource', '/services', '/amont'])
  })
  it('aucune affirmation causale ni question rhétorique dans les descriptions', () => {
    for (const s of [...SUJETS_ACCUEIL, ...PAGES_RESSOURCE]) {
      expect(s.texte).not.toMatch(/\?|provient|à cause|dû|due/)
    }
  })
})

describe('carte « Sécheresse aujourd’hui » : départements par niveau du jour', () => {
  const depts = [
    { niveauGraviteMax: 'crise' },
    { niveauGraviteMax: 'crise' },
    { niveauGraviteMax: 'alerte_renforcee' },
    { niveauGraviteMax: 'vigilance' },
    { niveauGraviteMax: null },
    { niveauGraviteMax: 'inconnu' },
  ]
  it('compte chaque département à son niveau le plus élevé ; sans niveau connu, sans restriction', () => {
    expect(comptesSecheresse(depts)).toEqual([2, 1, 0, 1, 2])
  })
  it('chiffre de tête : le niveau le plus grave atteint, au singulier comme au pluriel', () => {
    expect(teteSecheresse([2, 1, 0, 1, 2])).toEqual({ niveau: 4, n: 2, texte: 'départements en crise' })
    expect(teteSecheresse([5, 1, 0, 0, 0])).toEqual({ niveau: 1, n: 1, texte: 'département en vigilance' })
    expect(teteSecheresse([101, 0, 0, 0, 0])).toEqual({ niveau: 0, n: 101, texte: 'départements sans restriction' })
  })
  it('légende du plus grave au moins grave, sans les niveaux vides', () => {
    expect(legendeSecheresse([2, 1, 0, 1, 2]).map((l) => `${l.libelle} ${l.n}`)).toEqual(['crise 2', 'alerte renforcée 1', 'vigilance 1', 'sans restriction 2'])
  })
})

describe('carte « Prix et gestion » : dernière année SISPEA assez renseignée', () => {
  const stat = (pond: number | null, p50: number | null, n: number) => ({ n, p10: null, p50, p90: null, pond })
  const annee = (n: number, pond: number | null, p50: number | null) =>
    ({ n, pop: 1, prix: stat(pond, p50, n), rend: stat(null, null, 0), ilp: stat(null, null, 0), renouv: stat(null, null, 0), cbact: stat(null, null, 0), cchim: stat(null, null, 0), patrim: stat(null, null, 0), impayes: stat(null, null, 0) }) as never
  const nat = {
    annees: { '2024': annee(7879, 2.5, 2.44), '2025': annee(913, 2.45, 2.47) },
    gestion: { '2024': { regie: { pop: 46 }, delegation: { pop: 54 } } },
    depts: {},
    serie_api: {},
    indicateurs: {},
  } as unknown as SispeaNationalFile
  it('écarte une année trop peu déclarée (comme /services) et calcule la part des habitants en gestion déléguée', () => {
    expect(prixSispea(nat)).toEqual({ annee: '2024', moyen: 2.5, mediane: 2.44, services: 7879, partDelegation: 0.54 })
  })
  it('un département : ses propres chiffres de la même année ; sans déclaration, rien', () => {
    const avecDept = { ...nat, depts: { '02': { '2024': { ...(annee(126, 2.91, 2.62) as object), part_pop_delegation: 0.66 } } } } as unknown as SispeaNationalFile
    expect(prixSispea(avecDept, '02')).toEqual({ annee: '2024', moyen: 2.91, mediane: 2.62, services: 126, partDelegation: 0.66 })
    expect(prixSispea(avecDept, '03')).toBeNull()
  })
  it('phrase de la carte', () => {
    // espaces insécables du site ramenées à l'espace simple pour la comparaison
    expect(phrasePrix({ mediane: 2.44, services: 7879, partDelegation: 0.54 }).replace(/[  ]/g, ' ')).toBe(
      'Moyenne pondérée par la population ; la médiane des 7 879 services est de 2,44 €. 54 % des habitants relèvent d’un service en gestion déléguée.',
    )
    expect(prixSispea(null)).toBeNull()
  })
})

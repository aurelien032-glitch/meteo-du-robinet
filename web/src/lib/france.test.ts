import { describe, expect, it } from 'vitest'
import type { ComptesClasses } from './accueil'
import {
  ariaSort,
  champCsv,
  comptesParDepartement,
  csvFrance,
  effectifCD,
  ENTETES_CSV,
  etatLettreCommune,
  infoBulleDept,
  lettresCommunes,
  lignesFrance,
  nomFichierCsv,
  partCD,
  pctPartCD,
  pireLettreReseaux,
  rangLettre,
  trierFrance,
  triSuivant,
  type LigneFrance,
} from './france'
import { declarerPartiels, type SituationsFile } from './situations'
import type { DeptFile } from './types'

const situ = (reseaux: Record<string, string>, classes?: Record<string, string>): SituationsFile => ({
  familles: ['pesticides', 'azote', 'pfas', 'microbio', 'metaux_mineraux', 'autres'],
  reseaux,
  classes,
  depts: {},
  national: {},
})

const comptes = (A: number, B: number, C: number, D: number, nonClasses = 0): ComptesClasses => ({ A, B, C, D, classes: A + B + C + D, nonClasses })

describe('comptes par département (même règle que la fiche : pire lettre du réseau, préfixe du code)', () => {
  const s = situ(
    {
      '002000001': '000000', // A (absent de « classes »)
      '002000002': '200000', // C
      '002000003': '------', // sans famille analysée : à part
      '02A000001': '000300', // D
      '02A000002': '0-0000', // A
      '971000001': '100000', // B, lettre reprise d'une année antérieure (minuscule)
    },
    { '002000002': 'CAAAAA', '02A000001': 'AAADAA', '971000001': 'b-AAAA' },
  )
  const m = comptesParDepartement(s)
  it('un compte par département, Corse et outre-mer compris ; les réseaux sans classe à part', () => {
    expect([...m.keys()].sort()).toEqual(['02', '2A', '971'])
    expect(m.get('02')).toEqual({ A: 1, B: 0, C: 1, D: 0, classes: 2, nonClasses: 1 })
    expect(m.get('2A')).toEqual({ A: 1, B: 0, C: 0, D: 1, classes: 2, nonClasses: 0 })
    expect(m.get('971')).toEqual({ A: 0, B: 1, C: 0, D: 0, classes: 1, nonClasses: 0 })
  })
  it('part C ou D parmi les réseaux classés, effectif écrit', () => {
    expect(partCD(m.get('02'))).toBe(0.5)
    expect(partCD(comptes(0, 0, 0, 0, 3))).toBeNull()
    expect(partCD(undefined)).toBeNull()
    // Aisne 2025 (maquette du 05/10) : 217 sur 279.
    expect(effectifCD(comptes(50, 12, 200, 17))).toBe('217 sur 279')
  })
  it('fichier antérieur aux classes : aucun réseau classé', () => {
    expect(comptesParDepartement(situ({ '035000001': '000000' })).get('35')).toEqual({ A: 0, B: 0, C: 0, D: 0, classes: 0, nonClasses: 1 })
    expect(comptesParDepartement(null).size).toBe(0)
  })
})

describe('tableau des départements : alphabétique par défaut, tri au choix, effectif minimal', () => {
  const noms: Record<string, string> = { '01': 'Ain', '02': 'Aisne', '05': 'Hautes-Alpes', '04': 'Alpes-de-Haute-Provence', '75': 'Paris', '90': 'Territoire de Belfort', '974': 'La Réunion', '976': 'Mayotte' }
  const parDept = new Map<string, ComptesClasses>([
    ['01', comptes(280, 8, 10, 0)], // 3,4 %
    ['02', comptes(50, 12, 200, 17)], // 77,8 %
    ['05', comptes(400, 7, 50, 6)], // 12,1 %
    ['04', comptes(400, 13, 30, 1)], // 7,0 %
    ['75', comptes(4, 0, 0, 0)], // 0 % sur 4 réseaux, tous classés : se trie
    ['90', comptes(2, 0, 3, 0, 4)], // 60 % sur 5 réseaux classés, 9 au total : hors tri
    ['974', comptes(0, 0, 0, 0, 2)], // aucun réseau classé
    ['976', comptes(5, 0, 5, 0)], // 50 % sur 10 : se trie
  ])
  const lignes = lignesFrance(parDept, (dd) => noms[dd])
  const ordre = (l: readonly LigneFrance[]) => l.map((x) => x.dd)
  it('ordre alphabétique français par défaut (accents et traits d’union ignorés pour l’ordre)', () => {
    expect(lignes.map((l) => l.nom)).toEqual(['Ain', 'Aisne', 'Alpes-de-Haute-Provence', 'Hautes-Alpes', 'La Réunion', 'Mayotte', 'Paris', 'Territoire de Belfort'])
  })
  it('règle des classements : 10 réseaux classés au moins, ou tous ceux du département', () => {
    const c = Object.fromEntries(lignes.map((l) => [l.dd, l.classable]))
    expect(c).toMatchObject({ '75': true, '90': false, '976': true, '02': true })
  })
  it('tri par part décroissante : les parts hors tri puis sans réseau classé en fin de liste', () => {
    expect(ordre(trierFrance(lignes, { cle: 'part', desc: true }))).toEqual(['02', '976', '05', '04', '01', '75', '90', '974'])
  })
  it('tri par part croissante : les mêmes en fin de liste, quel que soit le sens', () => {
    expect(ordre(trierFrance(lignes, { cle: 'part', desc: false }))).toEqual(['75', '01', '04', '05', '976', '02', '90', '974'])
  })
  it('à part égale, l’ordre alphabétique', () => {
    const egales = lignesFrance(
      new Map([
        ['05', comptes(9, 0, 1, 0)],
        ['01', comptes(9, 0, 1, 0)],
      ]),
      (dd) => noms[dd],
    )
    expect(ordre(trierFrance(egales, { cle: 'part', desc: true }))).toEqual(['01', '05'])
  })
  it('bascule des en-têtes et aria-sort', () => {
    const t0 = { cle: 'nom' as const, desc: false }
    expect(ariaSort(t0, 'nom')).toBe('ascending')
    expect(ariaSort(t0, 'part')).toBe('none')
    const t1 = triSuivant(t0, 'part')
    expect(t1).toEqual({ cle: 'part', desc: true })
    expect(ariaSort(t1, 'part')).toBe('descending')
    expect(triSuivant(t1, 'part')).toEqual({ cle: 'part', desc: false })
    expect(triSuivant(t1, 'nom')).toEqual({ cle: 'nom', desc: false })
    expect(ordre(trierFrance(lignes, triSuivant(t0, 'nom')))[0]).toBe('90')
  })
})

describe('fichier CSV du tableau', () => {
  const lignes = lignesFrance(
    new Map([
      ['02', comptes(50, 12, 200, 17)],
      ['90', comptes(2, 0, 3, 0, 4)],
      ['974', comptes(0, 0, 0, 0, 2)],
    ]),
    (dd) => ({ '02': 'Aisne', '90': 'Territoire; "de" Belfort', '974': 'La Réunion' })[dd]!,
  )
  const csv = csvFrance(lignes, 2025)
  const rangs = csv.replace(/^﻿/, '').split('\r\n')
  it('marque UTF-8, en-têtes en français, séparateur point-virgule, fins de ligne CRLF', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(rangs[0]).toBe(ENTETES_CSV.join(';'))
    expect(rangs[0]).toContain('Part des réseaux notés C ou D (%)')
    expect(rangs).toHaveLength(lignes.length + 2) // en-têtes, lignes, ligne vide finale
  })
  it('virgule décimale, nombres sans espace, champs vides sans réseau classé', () => {
    expect(rangs[1]).toBe('02;Aisne;2025;279;50;12;200;17;217;77,8;0;oui')
    expect(rangs[2]).toBe('974;La Réunion;2025;0;0;0;0;0;0;;2;non')
  })
  it('échappement : guillemets doublés, champ entre guillemets s’il contient le séparateur', () => {
    expect(rangs[3]).toBe('90;"Territoire; ""de"" Belfort";2025;5;2;0;3;0;3;60;4;non')
    expect(champCsv('a"b')).toBe('"a""b"')
    expect(champCsv('ligne\nsuivante')).toBe('"ligne\nsuivante"')
    expect(champCsv('simple')).toBe('simple')
    expect(champCsv(3.5)).toBe('3,5')
    expect(champCsv(null)).toBe('')
  })
  it('nom de fichier daté ; l’année en cours est dite partielle', () => {
    declarerPartiels([2026])
    expect(nomFichierCsv(2025, new Date(2026, 9, 5))).toBe('meteo-du-robinet_classes-departements_2025_2026-10-05.csv')
    expect(nomFichierCsv(2026, new Date(2026, 0, 9))).toBe('meteo-du-robinet_classes-departements_2026-depuis-le-1er-janvier_2026-01-09.csv')
    declarerPartiels([])
  })
})

describe('lettre d’une commune : la plus défavorable des réseaux qui la desservent', () => {
  const s = situ(
    { '002000001': '000000', '002000002': '200000', '002000003': '000300', '002000004': '------' },
    { '002000002': 'CAAAAA', '002000003': 'AAADAA' },
  )
  it('pire lettre d’une liste de réseaux ; null sans réseau classé', () => {
    expect(pireLettreReseaux(s, ['002000001', '002000002'])).toBe('C')
    expect(pireLettreReseaux(s, ['002000002', '002000003', '002000001'])).toBe('D')
    expect(pireLettreReseaux(s, ['002000001'])).toBe('A')
    expect(pireLettreReseaux(s, ['002000004'])).toBeNull()
    expect(pireLettreReseaux(s, [])).toBeNull()
  })
  const dept = {
    dept: '02',
    annees: [2024, 2025],
    reseaux: {},
    communes: {
      '02001': { nom: 'Abbécourt', reseaux: { '2025': ['002000001'] }, stats: {} },
      '02002': { nom: 'Achery', reseaux: { '2025': ['002000001', '002000002'] }, stats: {} },
      '02003': { nom: 'Agnicourt', reseaux: { '2024': ['002000003'] }, stats: {} },
      '02004': { nom: 'Aguilcourt', reseaux: { '2025': ['002000004'] }, stats: {} },
    },
  } as unknown as DeptFile
  it('par commune et par année ; sans réseau rattaché cette année-là, absente', () => {
    const m = lettresCommunes(dept, s, 2025)
    expect(m.get('02001')).toEqual({ lettre: 'A', reseaux: 1 })
    expect(m.get('02002')).toEqual({ lettre: 'C', reseaux: 2 })
    expect(m.has('02003')).toBe(false)
    expect(m.get('02004')).toEqual({ lettre: null, reseaux: 1 })
    expect(lettresCommunes(dept, s, 2024).get('02003')).toEqual({ lettre: 'D', reseaux: 1 })
    expect(lettresCommunes(null, s, 2025).size).toBe(0)
  })
  it('rang sur l’échelle de la carte et info-bulle', () => {
    expect(['A', 'B', 'C', 'D', null].map((l) => rangLettre(l as never))).toEqual([0, 1, 2, 3, null])
    expect(etatLettreCommune({ lettre: 'C', reseaux: 2 }, 2025)).toBe('note la plus défavorable C, qualité insuffisante* (2 réseaux)')
    expect(etatLettreCommune({ lettre: 'A', reseaux: 1 }, 2025)).toBe('note A, bonne qualité* (un réseau)')
    expect(etatLettreCommune({ lettre: null, reseaux: 1 }, 2025)).toBe('pas de note (un réseau)')
    expect(etatLettreCommune(undefined, 2025)).toBe('aucun réseau rattaché en 2025')
  })
})

describe('part écrite', () => {
  it('une décimale, sans franchir une borne de la légende', () => {
    expect(pctPartCD(217 / 279)).toBe('77,8 %')
    expect(pctPartCD(0.0997)).toBe('9,97 %')
    expect(pctPartCD(0.1)).toBe('10,0 %')
    expect(pctPartCD(0.4996)).toBe('49,96 %')
    expect(pctPartCD(0)).toBe('0,0 %')
  })
})

describe('info-bulle d’un département', () => {
  it('part, effectif et répartition ; sans réseau classé, une phrase', () => {
    expect(infoBulleDept('Aisne', '02', comptes(50, 12, 200, 17), 2025)).toBe(
      '<b>Aisne</b> (02)<br>77,8 % des réseaux notés C ou D (217 sur 279)<br><span class="muted">A 50 · B 12 · C 200 · D 17</span>',
    )
    expect(infoBulleDept('La Réunion', '974', comptes(0, 0, 0, 0, 2), 2025)).toBe('<b>La Réunion</b> (974)<br>aucun réseau noté en 2025')
  })
})

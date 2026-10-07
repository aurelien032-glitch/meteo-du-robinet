import { afterEach, describe, expect, it } from 'vitest'
// Modèle réel du site : index.html de web/, celui que Vite recopie dans dist/.
import modele from '../../index.html?raw'
import { periode, type GroupeAvis } from './avis'
import { NOTE_LIBELLES_ARS, phraseBilan, RESEAU_DU_LOGEMENT } from './bilan'
import { CONSTAT_DEPASSEMENT, MISE_EN_GARDE_ARS, phraseVerdict, RAPPEL_DEPASSEMENT, renvoiAvis, texteVerdict, type ReseauBulletin } from './bulletin'
import { fmt } from './data'
import {
  accueilHtml,
  adresseCanonique,
  contenuAccueil,
  contenuCommune,
  contenuReseau,
  contenuService,
  descriptionCommune,
  descriptionReseau,
  nomService,
  pageHtml,
  sansCommentaires,
  titreCommune,
  titreReseau,
  titreService,
  type FicheCommune,
  type FicheReseau,
  type FicheService,
} from './prerendu'
import { lignesReseauxService, phraseNotesReseaux } from './service'
import { classeArs, declarerPartiels, synthese, type SituationsFile } from './situations'
import type { CommuneYearStats, SispeaService, SispeaYear } from './types'

const r = (code: string, nom: string, situation: string | null): ReseauBulletin => ({ code, nom, situation })
const stats = {
  plv: [458, 0, 458, 0, 458, 0, 0],
  fam: { pesticides: [12000, 0, 0, 40], azote: [900, 2, 0, 900], microbio: [4000, 1, 3, 12] },
  cle: {},
  dep: [],
} as unknown as CommuneYearStats
const fiche = (o: Partial<FicheCommune> = {}): FicheCommune => ({
  code: '51454',
  nom: 'Reims',
  dept: '51',
  nomDept: 'Marne',
  annee: '2025',
  stats,
  reseaux: [r('051000885', 'CU GRAND REIMS', '220100')],
  distributeurs: ['CU DU GRAND REIMS'],
  avis: [],
  ...o,
})

afterEach(() => declarerPartiels([]))

// Classes calculées (situations/<année>.json, champ `classes`) : C pour les pesticides de Reims.
const SITU = { familles: [], reseaux: { '051000885': '220100', '051000886': '000000' }, classes: { '051000885': 'CAAAAA' }, depts: {}, national: {} } as SituationsFile

describe('fiche commune pré-générée : le bilan des classes calculées', () => {
  it('une ligne par réseau : lettre, libellé de l’indicateur, cause ; mise en garde et note', () => {
    const html = contenuCommune(fiche({ reseaux: [{ ...r('051000885', 'Grand Reims', '220100'), ars: classeArs(SITU, '051000885') }] }))
    expect(html).toContain('<h2>La qualité de l’eau en 2025</h2>')
    expect(html).toContain(phraseBilan(false))
    expect(html).toContain('<strong>Note C</strong> (qualité insuffisante*) · Pesticides : dépassements plus de 30 jours.')
    expect(html).toContain(NOTE_LIBELLES_ARS)
    expect(html).toContain(MISE_EN_GARDE_ARS)
    expect(html).not.toContain(RESEAU_DU_LOGEMENT)
  })
  it('plusieurs réseaux : chacun nommé, du plus défavorable au plus favorable, et la facture pour savoir lequel', () => {
    const html = contenuCommune(
      fiche({
        reseaux: [
          { ...r('051000886', 'Tinqueux', '000000'), ars: classeArs(SITU, '051000886') },
          { ...r('051000885', 'Grand Reims', '220100'), ars: classeArs(SITU, '051000885') },
        ],
      }),
    )
    expect(html).toContain(phraseBilan(true))
    expect(html).toContain('<li><strong>Note C</strong> (qualité insuffisante*) · Grand Reims : Pesticides : dépassements plus de 30 jours.</li>')
    expect(html).toContain('<li><strong>Note A</strong> (bonne qualité*) · Tinqueux : Conforme aux limites de qualité prises en compte par la note.</li>')
    expect(html.indexOf('Grand Reims :')).toBeLessThan(html.indexOf('Tinqueux :'))
    expect(html).toContain(RESEAU_DU_LOGEMENT)
  })
  it('un réseau sans classe le dit', () => {
    expect(contenuCommune(fiche())).toContain('<strong>Pas de note</strong> · Pas de note en 2025.')
  })
  it('la description porte la lettre calculée, partagée avec la page', () => {
    expect(descriptionCommune('Reims', '2025', ['C'])).toBe(
      "Qualité de l'eau du robinet à Reims : note calculée C selon la méthode de l'ARS (bilan 2025) ; pesticides, nitrates, PFAS, service d'eau et restrictions sécheresse.",
    )
    expect(descriptionCommune('Reims', '2025', ['A', 'C'])).toContain('notes calculées A et C selon la méthode de l')
    expect(descriptionReseau('Grand Reims', '051000885', '2025', 'C')).toContain('(051000885) : note calculée C selon la méthode de l')
  })
})

describe('fiche commune pré-générée : le bulletin mot pour mot', () => {
  it('le verdict et la phrase d’appui sont ceux du bulletin', () => {
    const f = fiche()
    const html = contenuCommune(f)
    const s = synthese(f.reseaux.map((x) => x.situation))
    expect(html).toContain(`<strong>${phraseVerdict(s, f.annee)}</strong>`)
    expect(html).toContain(texteVerdict(f.reseaux, 'la commune', f.annee))
    expect(html).toContain('<h1>Reims</h1>')
    expect(html).toContain('Marne · l’eau y est distribuée par un réseau')
    expect(html).toContain('Code INSEE 51454 · <a href="/commune/51454/analyses/">Toutes les analyses</a>')
  })
  it('un dépassement rappelle qu’il ne suffit pas à déconseiller l’eau', () => {
    expect(contenuCommune(fiche())).toContain(`${CONSTAT_DEPASSEMENT} ${RAPPEL_DEPASSEMENT}`)
    // Rennes : conforme aux limites, réserve nitrates ; aucun rappel de dépassement.
    const rennes = contenuCommune(fiche({ nom: 'Rennes', reseaux: [r('035004230', 'CEBR', '020000')] }))
    expect(rennes).toContain('Eau conforme aux limites réglementaires en 2025')
    expect(rennes).not.toContain(RAPPEL_DEPASSEMENT)
  })
  it('un avis de l’ARS dans l’année : la phrase y renvoie, comme le bulletin, et la rubrique le présente', () => {
    const a: GroupeAvis = { id: 7, texte: '…', cat: 'sensibles', local: false, causes: ['PFAS'], debut: '2025-03-03', fin: '2025-06-12', n: 4, reseaux: ['051000885'] }
    const html = contenuCommune(fiche({ avis: [a, { ...a, id: 8, cat: 'ebullition', local: true, causes: [], debut: '2025-07-01', fin: '2025-07-01', n: 1 }] }))
    expect(html).toContain(`${CONSTAT_DEPASSEMENT} ${renvoiAvis('2025')}`)
    expect(html).not.toContain(RAPPEL_DEPASSEMENT)
    expect(html).toContain('<h3>Avis de l’ARS en 2025</h3>')
    const p = periode(a.debut, a.fin)
    expect(html).toContain(`<li><strong>Déconseillée aux publics sensibles</strong> · ${p.charAt(0).toUpperCase() + p.slice(1)} · 4 prélèvements · PFAS</li>`)
    expect(html).toContain('limité à un bâtiment, un point d’usage ou au seul point de prélèvement</li>')
  })
  it('année en cours : aucune phrase sur ses avis, qui vieillirait (refonte, lot 1)', () => {
    declarerPartiels([2026])
    const a: GroupeAvis = { id: 7, texte: '…', cat: 'ebullition', local: false, causes: [], debut: '2026-03-03', fin: '2026-03-10', n: 2, reseaux: ['051000885'] }
    const html = contenuCommune(fiche({ annee: '2026', avis: [a] }))
    expect(html).not.toContain('Avis de l’ARS')
    expect(html).not.toContain('ébullition')
    expect(html).toContain(`${CONSTAT_DEPASSEMENT} ${RAPPEL_DEPASSEMENT}`)
    expect(html).toContain('Depuis le 1er janvier 2026, le contrôle sanitaire a réalisé')
  })
  it('sans avis publié, rien n’est écrit sur les avis (pas d’information n’est pas aucun avis)', () => {
    const html = contenuCommune(fiche())
    expect(html).not.toContain('Avis de l’ARS')
    expect(html).not.toMatch(/aucun avis/i)
  })
  it('les comptes et le distributeur, avec sa source', () => {
    const html = contenuCommune(fiche())
    expect(html).toContain(`458 prélèvements et ${fmt.int(16900)} analyses à Reims ; 3 analyses ont dépassé une limite de qualité.`)
    expect(html).toContain('<a href="/departement/51/">Fiche du département : Marne (51)</a>')
    expect(html).toContain('Distributeur (contrôle sanitaire) : CU DU GRAND REIMS.')
  })
  it('une année sans prélèvement le dit, sans verdict', () => {
    const html = contenuCommune(fiche({ stats: undefined, reseaux: [] }))
    expect(html).toContain('Aucun prélèvement du contrôle sanitaire n’est enregistré à Reims en 2025.')
    expect(html).not.toContain('b-verdict')
    expect(html).not.toContain('desservie par')
  })
  it('les noms sont échappés', () => {
    const html = contenuCommune(fiche({ nom: 'A<b>&"c', distributeurs: ['<script>'] }))
    expect(html).toContain('<h1>A&lt;b&gt;&amp;&quot;c</h1>')
    expect(html).not.toContain('<script>')
  })
})

describe('accueil pré-généré (refonte, lot 2)', () => {
  const c = { A: 17341, B: 2202, C: 3011, D: 576, classes: 23130, nonClasses: 0 }
  const html = contenuAccueil({ annee: '2025', comptes: c })
  it('titre, bilan calculé, prudence, sujets et ressource, liens à barre finale', () => {
    expect(html).toContain('<h1>Quelle eau coule à votre robinet ?</h1>')
    expect(html).toContain('<strong>Trois réseaux sur quatre ont la note A</strong>')
    expect(html).toContain('A bonne qualité* : 75,0 % (17 341 réseaux)')
    expect(html).toContain('fait foi et peut différer')
    expect(html).toContain('la mairie et l’ARS font foi')
    expect(html).toContain('<a href="/themes/pfas/">PFAS et TFA</a>')
    expect(html).toContain('<a href="/ressource-en-eau/">Autour de l’eau du robinet</a>')
    expect(html).not.toMatch(/217|en ce moment/i)
  })
  it('sans classes calculées, pas de bilan ; placé dans #root du modèle, jamais deux fois', () => {
    expect(contenuAccueil({ annee: '2025', comptes: null })).not.toContain('Bilan 2025')
    const h = accueilHtml(modele, html)
    expect(h).toContain(`<div id="root">${html}</div>`)
    expect(() => accueilHtml(h, html)).toThrow(/div#root/)
  })
})

describe('page HTML : titre, description, adresse canonique', () => {
  const page = pageHtml(modele, { route: '/commune/51454', titre: titreCommune('Reims', '51'), description: descriptionCommune('Reims'), contenu: contenuCommune(fiche()) })
  it('les balises de la page, une seule adresse canonique, barre finale', () => {
    expect(page).toContain('<title>Reims (51) · eau du robinet · Météo du robinet</title>')
    expect(page).toContain(`<meta name="description" content="${descriptionCommune('Reims').replace(/'/g, "'")}" />`)
    expect(page).toContain('<meta property="og:url" content="https://meteodurobinet.fr/commune/51454/" />')
    expect(page.match(/rel="canonical"/g)).toHaveLength(1)
    expect(page).toContain('<link rel="canonical" href="https://meteodurobinet.fr/commune/51454/" />')
  })
  it('l’adresse canonique de l’accueil, portée par le modèle, est remplacée et non doublée', () => {
    const accueil = modele.replace('</head>', '  <link rel="canonical" href="https://meteodurobinet.fr/" />\n  </head>')
    const p = pageHtml(accueil, { route: '/commune/51454', titre: 't', description: 'd' })
    expect(p.match(/rel="canonical"/g)).toHaveLength(1)
    expect(p).toContain('href="https://meteodurobinet.fr/commune/51454/"')
  })
  it('la page dit comment la citer, licence comprise, pour les agents qui ne lisent pas le JavaScript (07/10)', () => {
    expect(page).toContain('Pour citer cette page : Météo du robinet (meteodurobinet.fr), conçue par Hydroforge (hydroforge.fr), d’après le contrôle sanitaire des eaux du ministère chargé de la Santé, « Reims (51) · eau du robinet · Météo du robinet », https://meteodurobinet.fr/commune/51454/.')
    expect(page).toContain('rel="license">CC BY-NC 4.0</a>')
    expect(page.match(/Pour citer cette page/g)).toHaveLength(1)
    expect(page).toContain('<a href="https://hydroforge.fr/dataviz/">hydroforge.fr/dataviz</a>')
  })
  it('le contenu est placé dans #root', () => {
    expect(page).toMatch(/<div id="root"><main class="page prerendu">[\s\S]*<\/main><\/div>/)
  })
  it('le texte de l’année par défaut est masqué dès que le JavaScript s’exécute', () => {
    // Sans quoi un visiteur qui demande ?annee=2024 lirait un instant le bilan 2025.
    expect(page).toContain("document.documentElement.classList.add('js')")
    expect(page).toContain('.js .prerendu { display: none }')
    expect(page.indexOf('.js .prerendu')).toBeLessThan(page.indexOf('<div id="root">'))
  })
  it('adresse canonique : barre finale, jamais doublée', () => {
    expect(adresseCanonique('/')).toBe('https://meteodurobinet.fr/')
    expect(adresseCanonique('/commune/33063')).toBe('https://meteodurobinet.fr/commune/33063/')
    expect(adresseCanonique('/commune/33063/')).toBe('https://meteodurobinet.fr/commune/33063/')
  })
  it('un modèle sans balise attendue fait échouer la génération', () => {
    expect(() => pageHtml('<html></html>', { route: '/x', titre: 't', description: 'd' })).toThrow(/title/)
  })
})

describe('fiche réseau pré-générée', () => {
  const reseau = (o: Partial<FicheReseau> = {}): FicheReseau => ({
    code: '051000885',
    nom: 'CU GRAND REIMS',
    dept: '51',
    nomDept: 'Marne',
    annee: '2025',
    stats,
    situation: '220100',
    avis: [],
    communes: [{ code: '51454', nom: 'Reims' }, { code: '51612', nom: 'Tinqueux' }],
    services: [{ id: '51454X', nom: 'CU du Grand Reims', entite: 'Régie' }, { id: null, nom: 'Service sans fiche', entite: null }],
    dist: 'CU DU GRAND REIMS',
    uge: 'CU DU GRAND REIMS',
    ...o,
  })
  it('le verdict du bulletin du réseau, mot pour mot, et ses comptes', () => {
    const html = contenuReseau(reseau())
    const r = [{ code: '051000885', nom: 'CU GRAND REIMS', situation: '220100' }]
    expect(html).toContain(`<strong>${phraseVerdict(synthese(['220100']), '2025')}</strong>`)
    expect(html).toContain(texteVerdict(r, 'la commune', '2025'))
    expect(html).toContain('Marne · ce réseau dessert 2 communes')
    expect(html).toContain('Code du réseau 051000885')
    expect(html).toContain(`458 prélèvements et ${fmt.int(16900)} analyses sur ce réseau ; 3 analyses ont dépassé une limite de qualité.`)
  })
  it('« Où arrive cette eau ? » : communes et services en liens, distributeur avec sa source', () => {
    const html = contenuReseau(reseau())
    expect(html).toContain('<a href="/commune/51454/">Reims</a>')
    expect(html).toContain('<a href="/service/51454X/">CU du Grand Reims</a> · Régie')
    expect(html).toContain('<li>Service sans fiche</li>')
    expect(html).toContain('Distributeur (contrôle sanitaire) : CU DU GRAND REIMS.')
    // Unité de gestion identique au distributeur : écrite une seule fois, comme la page.
    expect(html).not.toContain('Unité de gestion')
    expect(contenuReseau(reseau({ uge: 'VEOLIA' }))).toContain('Unité de gestion (contrôle sanitaire) : VEOLIA.')
  })
  it('une année sans prélèvement le dit', () => {
    const html = contenuReseau(reseau({ stats: undefined, communes: [] }))
    expect(html).toContain('Aucun prélèvement du contrôle sanitaire n’est rattaché à ce réseau en 2025.')
    expect(html).toContain('Aucune commune desservie en 2025.')
    expect(html).not.toContain('b-verdict')
  })
})

describe('fiche service pré-générée', () => {
  const situ = { reseaux: { '051000885': '220100', '051000886': '000000' }, classes: { '051000885': 'CC-AAA' } } as unknown as SituationsFile
  const info = (nom: string) => ({ nom, dist: 'CU DU GRAND REIMS', uge: null, communes: [] })
  const lignes = lignesReseauxService(
    [
      { code: '051000886', info: info('VEOLIA NORD'), communes: ['51612'] },
      { code: '051000885', info: info('CU GRAND REIMS'), communes: ['51454'] },
    ],
    situ,
    '2025',
  )
  const med = { prix: { p50: 2.1 }, rend: { p50: 80 } } as unknown as SispeaYear
  const service = (o: Partial<SispeaService> = {}): FicheService => ({
    id: '51454X',
    s: { coll: 'CU du Grand Reims', nom: 'Eau potable : régie', dept: '51', mode: 'Régie', op: 'Régie', pop: 300000, annee_ind: 2024, ind: { 'D102.0': 2.456, 'P104.3': 85.2 }, annee_communes: 2024, communes: ['51454', '51612'], ...o },
    nomDept: 'Marne',
    annee: '2025',
    mediane: { annee: '2024', valeurs: med },
    reseaux: lignes,
    situations: { '051000885': '220100', '051000886': '000000' },
    communes: [{ code: '51454', nom: 'Reims' }, { code: '51612', nom: 'Tinqueux' }],
  })
  it('prix, mode de gestion et indicateurs face à la médiane France', () => {
    const html = contenuService(service())
    expect(html).toContain(`<strong>${fmt.dec(2.456, 2)} €</strong> le m³ toutes taxes comprises, pour 120 m³ par an.`)
    expect(html).toContain('Régie · Exploitant : Régie')
    expect(html).toContain(`<tr><td>Rendement du réseau</td><td>${fmt.dec(85.2, 1)} %</td><td>${fmt.dec(80, 1)} %</td></tr>`)
    expect(html).toContain('<h1>CU du Grand Reims</h1>')
  })
  it('ses réseaux : la note de chacun, de la plus défavorable à la plus favorable, comme la page', () => {
    const html = contenuService(service())
    expect(html).toContain(`${phraseNotesReseaux(lignes)}.`)
    expect(html).toContain('1 réseau noté C et 1 réseau noté A.')
    const i = html.indexOf('/reseau/051000885/')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(html.indexOf('/reseau/051000886/'))
    expect(html).toContain('<strong>Note C</strong> (qualité insuffisante*)')
    expect(html).toContain('La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi.')
    expect(html).toContain('<a href="/commune/51612/">Tinqueux</a>')
  })
  it('un service sans déclaration le dit, sans prix ni tableau', () => {
    const html = contenuService(service({ sans_declaration: true, ind: undefined, statut: 'Non déclaré' }))
    expect(html).toContain('Aucune déclaration de ce service ne figure à la SISPEA')
    expect(html).toContain('(statut : « Non déclaré »)')
    expect(html).not.toContain('<table>')
    expect(contenuService(service({ ind: {} }))).toContain('Indicateurs non publiés')
  })
  it('titres et descriptions partagés avec les pages', () => {
    expect(titreReseau('CU GRAND REIMS')).toBe('Réseau CU GRAND REIMS · eau du robinet')
    expect(titreService(nomService(service().s, '51454X'))).toBe('CU du Grand Reims · service d’eau')
    expect(nomService({ coll: '.', nom: null }, '999')).toBe('999')
  })
})

describe('sansCommentaires : modèle allégé des pages pré-générées', () => {
  it('retire les commentaires HTML et ceux des scripts, garde le code, le JSON-LD et les balises attendues', () => {
    const allege = sansCommentaires(modele)
    expect(allege).not.toMatch(/<!--/)
    expect(allege).not.toMatch(/\/\*/)
    expect(allege).toContain("document.documentElement.classList.add('js')")
    expect(allege).toContain('application/ld+json')
    expect(allege).toContain('<div id="root"></div>')
    expect(allege.length).toBeLessThan(modele.length - 500)
    expect(() => pageHtml(allege, { route: '/commune/02691/', titre: 'Saint-Quentin', description: 'Essai' })).not.toThrow()
  })
})

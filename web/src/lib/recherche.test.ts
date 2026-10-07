import { describe, expect, it } from 'vitest'
import {
  chercher,
  choixRequis,
  codePostal,
  entreesCommunes,
  entreesReseaux,
  entreesServices,
  indexer,
  libelleResultat,
  lienFiche,
  motifCode,
  normaliser,
  precision,
  relireCodes,
  type Entree,
} from './recherche'

// Noms et codes réels (communes.json, sispea/services-index.json, dept/35.json et 50.json). Poids des communes
// fictifs, seul leur ordre compte ; habitants desservis des services et communes desservies des réseaux réels.
const commune = (id: string, nom: string, poids: number): Entree => ({ type: 'commune', id, nom, poids })
const INDEX = indexer([
  commune('35238', 'Rennes', 220000),
  commune('02641', 'Renneval', 150),
  commune('08360', 'Renneville', 120),
  commune('11309', 'Rennes-le-Château', 90),
  commune('11310', 'Rennes-les-Bains', 200),
  commune('27488', 'Renneville', 300),
  commune('2A258', 'Renno', 60),
  commune('50129', 'Cherbourg-en-Cotentin', 78000),
  commune('02177', 'Chérêt', 100),
  commune('18058', 'Châteauneuf-sur-Cher', 1500),
  commune('50082', 'Bricquebec-en-Cotentin', 5000),
  commune('50522', 'Saint-Maurice-en-Cotentin', 300),
  commune('35288', 'Saint-Malo', 47000),
  commune('35289', 'Saint-Malo-de-Phily', 900),
  commune('67482', 'Strasbourg', 290000),
  commune('02565', 'Œuilly', 250),
  commune('14087', 'Bonnœil', 150),
  { type: 'service', id: '77654', nom: 'Collectivité Eau du Bassin Rennais (CEBR)', poids: 121480 },
  { type: 'service', id: '320874', nom: 'CA DU COTENTIN', poids: 133611 },
  { type: 'service', id: '90290', nom: 'CA DU COTENTIN', poids: 3544 },
  { type: 'service', id: '90189', nom: "SMP DE L'ISTHME DU COTENTIN", poids: 484 },
  { type: 'service', id: '185441', nom: 'Rennes-le-Château', poids: 90 },
  { type: 'reseau', id: '035004230', nom: 'CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', poids: 12 },
  { type: 'reseau', id: '035000802', nom: 'ST MALO_BOIS JOLI/BEAUFORT_ST MALO', poids: 1 },
  { type: 'reseau', id: '050000645', nom: 'ASSELINERIE', poids: 1 },
])

const noms = (q: string, type: Entree['type'] = 'commune') => chercher(q, INDEX).find((g) => g.type === type)?.entrees.map((e) => e.nom) ?? []

describe('normaliser', () => {
  it('sans accents ni casse, ponctuation réduite, œ et St développés', () => {
    expect(normaliser('Rennes-le-Château')).toBe('rennes le chateau')
    expect(normaliser("SMP DE L'ISTHME DU COTENTIN")).toBe('smp de l isthme du cotentin')
    expect(normaliser('Bonnœil')).toBe('bonnoeil')
    expect(normaliser('ST MALO_BOIS JOLI/BEAUFORT_ST MALO')).toBe('saint malo bois joli beaufort saint malo')
    expect(normaliser('  st malo ', false)).toBe('saint malo')
    expect(normaliser('st', false)).toBe('st')
  })
})

describe('chercher', () => {
  it('« renn » : Rennes d’abord, les homonymes ensuite par poids', () => {
    expect(noms('renn')).toEqual(['Rennes', 'Renneville', 'Rennes-les-Bains', 'Renneval', 'Renneville', 'Rennes-le-Château'])
  })
  it('« cher » : Cherbourg-en-Cotentin avant les autres débuts de nom, un mot intérieur ensuite', () => {
    expect(noms('cher')).toEqual(['Cherbourg-en-Cotentin', 'Chérêt', 'Châteauneuf-sur-Cher'])
  })
  it('« cotentin » : les trois communes par mot, les services par habitants desservis, du plus grand au plus petit', () => {
    expect(noms('cotentin')).toEqual(['Cherbourg-en-Cotentin', 'Bricquebec-en-Cotentin', 'Saint-Maurice-en-Cotentin'])
    expect(chercher('cotentin', INDEX).find((g) => g.type === 'service')?.entrees.map((e) => e.id)).toEqual(['320874', '90290', '90189'])
  })
  it('un nom exact passe avant un début de nom, même moins lourd', () => {
    expect(noms('rennes le chateau', 'commune')).toEqual(['Rennes-le-Château'])
    expect(noms('renneville')).toEqual(['Renneville', 'Renneville'])
  })
  it('codes INSEE, SISPEA et de réseau trouvés tels quels, en tête de leur groupe', () => {
    expect(chercher('35238', INDEX)).toEqual([{ type: 'commune', titre: 'Communes', entrees: [expect.objectContaining({ nom: 'Rennes' })] }])
    expect(chercher('2a258', INDEX)[0].entrees[0].nom).toBe('Renno')
    expect(noms('77654', 'service')).toEqual(['Collectivité Eau du Bassin Rennais (CEBR)'])
    expect(noms('050000645', 'reseau')).toEqual(['ASSELINERIE'])
  })
  it('groupes dans l’ordre communes, services, réseaux ; « st malo » trouve la commune et le réseau abrégé', () => {
    const g = chercher('st malo', INDEX)
    expect(g.map((x) => x.type)).toEqual(['commune', 'reseau'])
    expect(g[0].entrees.map((e) => e.nom)).toEqual(['Saint-Malo', 'Saint-Malo-de-Phily'])
    expect(g[1].entrees.map((e) => e.id)).toEqual(['035000802'])
    expect(noms('st')).toEqual(['Strasbourg'])
  })
  it('services et réseaux : un mot du nom vaut un début de nom, le poids départage', () => {
    expect(noms('renn', 'service')).toEqual(['Collectivité Eau du Bassin Rennais (CEBR)', 'Rennes-le-Château'])
    expect(noms('renn', 'reseau')).toEqual(['CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'])
    // …mais pas pour les communes : « cher » garde les noms qui commencent ainsi devant un mot intérieur
    expect(noms('cher')).toEqual(['Cherbourg-en-Cotentin', 'Chérêt', 'Châteauneuf-sur-Cher'])
  })
  it('« rennes » trouve aussi le service et le réseau de la CEBR, par un mot de leur nom', () => {
    expect(noms('rennes', 'service')).toEqual(['Rennes-le-Château'])
    expect(noms('rennais', 'service')).toEqual(['Collectivité Eau du Bassin Rennais (CEBR)'])
    expect(noms('rennes', 'reseau')).toEqual(['CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'])
  })
  it('œ tapé en deux lettres, accents et casse ignorés ; requête vide ou sans lettre : rien', () => {
    expect(noms('bonnoeil')).toEqual(['Bonnœil'])
    expect(noms('OEUILLY')).toEqual(['Œuilly'])
    expect(noms('chéret')).toEqual(['Chérêt'])
    expect(chercher('', INDEX)).toEqual([])
    expect(chercher(' - ', INDEX)).toEqual([])
  })
  it('au plus six communes, quatre services, quatre réseaux', () => {
    const beaucoup = indexer(Array.from({ length: 10 }, (_, i) => [commune(`990${i}`, `Ville ${i}`, i), { type: 'service' as const, id: `s${i}`, nom: `Ville ${i}`, poids: i }]).flat())
    expect(chercher('ville', beaucoup).map((g) => [g.type, g.entrees.length])).toEqual([
      ['commune', 6],
      ['service', 4],
    ])
  })
})

describe('codes postaux (audit du 05/10 : « 02100 » menait à Bony, dont c’est le code INSEE)', () => {
  // Saint-Quentin et deux communes voisines ont le code postal 02100 ; Bony a le code INSEE 02100 et le code postal 02420.
  const AISNE = { '02': 'Aisne', '35': 'Ille-et-Vilaine' }
  const cp = (id: string, nom: string, poids: number, codes: string[]) => ({ ...commune(id, nom, poids), cp: codes, dept: id.slice(0, 2), detail: codes.join(', ') })
  const IDX = indexer([
    cp('02100', 'Bony', 20, ['02420']),
    cp('02288', 'Gauchy', 40, ['02430', '02100']),
    cp('02691', 'Saint-Quentin', 70, ['02100']),
    cp('02355', 'Harly', 30, ['02100']),
    cp('35238', 'Rennes', 71, ['35000', '35200', '35700']),
  ])
  it('cinq chiffres : les communes de ce code postal d’abord, par poids, puis la commune dont c’est le code INSEE', () => {
    expect(chercher('02100', IDX)[0].entrees.map((e) => e.nom)).toEqual(['Saint-Quentin', 'Gauchy', 'Harly', 'Bony'])
    expect(chercher('02 100', IDX)[0].entrees.map((e) => e.nom)).toEqual(['Saint-Quentin', 'Gauchy', 'Harly', 'Bony'])
    expect(chercher('35700', IDX)[0].entrees.map((e) => e.nom)).toEqual(['Rennes'])
    expect(codePostal('2A004')).toBeNull()
    expect(codePostal('0210')).toBeNull()
  })
  it('libellés : « Saint-Quentin · 02100 », code postal ; « Bony », code INSEE', () => {
    const [sq, , , bony] = chercher('02100', IDX)[0].entrees
    expect(libelleResultat(sq, '02100', AISNE)).toEqual({ nom: 'Saint-Quentin · 02100', meta: 'Aisne · code postal' })
    expect(libelleResultat(bony, '02100', AISNE)).toEqual({ nom: 'Bony', meta: 'Aisne · code INSEE 02100' })
    expect(motifCode(sq, 'saint-quentin')).toBeNull()
    expect(libelleResultat(sq, 'saint-quentin', AISNE)).toEqual({ nom: 'Saint-Quentin', meta: 'Aisne · 02100' })
  })
  it('un code postal de plus de six communes les donne toutes, et la commune du code INSEE ensuite', () => {
    const grand = indexer([...Array.from({ length: 9 }, (_, i) => cp(`510${i}0`, `Village ${i}`, i, ['51300'])), cp('51300', 'Code INSEE', 1, ['51000'])])
    const liste = chercher('51300', grand)[0].entrees
    expect(liste).toHaveLength(10)
    expect(liste.at(-1)?.nom).toBe('Code INSEE')
  })
  it('plusieurs fiches pour un code : un choix est requis ; une seule fiche, ou un nom : non', () => {
    expect(choixRequis('02100', chercher('02100', IDX))).toBe(true)
    expect(choixRequis('35000', chercher('35000', IDX))).toBe(false)
    expect(choixRequis('rennes', chercher('rennes', IDX))).toBe(false)
  })
})

describe('entrées des fichiers de l’index', () => {
  const D = { '35': 'Ille-et-Vilaine', '50': 'Manche' }
  it('codes en écarts relus : même exemple que le test du pipeline (tests/test_recherche.py)', () => {
    const CODES = ['01001', '01002', '01004', '19999', '2A001', '2A004', '2B002', '21001', '97101', '97102', '97102', '555', '77654', '320874', '035004230', '050000645', 'SANS-CHIFFRE', 'X1']
    const ECARTS = ['01001', 1, 2, 18995, '2A001', 3, '2B002', '21001', 76100, 1, '97102', '555', '77654', '320874', '035004230', 14996415, 'SANS-CHIFFRE', 'X1']
    expect(relireCodes(ECARTS)).toEqual(CODES)
    expect(relireCodes([])).toEqual([])
  })
  it('communes en colonnes ; précision : nom du département, sinon son code, puis le code INSEE (index sans codes postaux)', () => {
    const c = entreesCommunes({ c: ['2A004', '35238', 1], n: ['Ajaccio', 'Rennes', 'Retiers'], p: [64, 71, 49] })
    expect(c.map((e) => [e.type, e.id, e.nom, e.poids, e.dept])).toEqual([
      ['commune', '2A004', 'Ajaccio', 64, '2A'],
      ['commune', '35238', 'Rennes', 71, '35'],
      ['commune', '35239', 'Retiers', 49, '35'],
    ])
    expect(precision(c[1], D)).toBe('Ille-et-Vilaine · code INSEE 35238')
    expect(precision(c[0], D)).toBe('2A · code INSEE 2A004')
    expect(precision(c[1], null)).toBe('35 · code INSEE 35238')
  })
  it('codes postaux en colonne « z » : un, plusieurs ou aucun ; en précision à la place du code INSEE', () => {
    const c = entreesCommunes({
      c: ['35238', 1, '75056', '99999'],
      n: ['Rennes', 'Retiers', 'Paris', 'Sans code'],
      p: [71, 49, 80, 0],
      z: [['35000', '35200', '35700'], '35240', Array.from({ length: 21 }, (_, i) => `750${String(i + 1).padStart(2, '0')}`), null],
    })
    expect(c.map((e) => e.cp)).toEqual([['35000', '35200', '35700'], ['35240'], expect.any(Array), []])
    expect(c.map((e) => precision(e, D))).toEqual([
      'Ille-et-Vilaine · 35000, 35200, 35700',
      'Ille-et-Vilaine · 35240',
      '75 · 75001 et 20 autres codes postaux',
      '99 · code INSEE 99999',
    ])
  })
  it('services : collectivité en nom, entité et mode en précision', () => {
    const [anonyme, cotentin] = entreesServices({
      i: ['555', '320874'],
      n: [null, 'CA DU COTENTIN'],
      e: [null, 'AEP-Régie'],
      d: ['971', '50'],
      p: [0, 68],
      m: [null, 'regie'],
    })
    expect([cotentin.nom, precision(cotentin, D), cotentin.poids, lienFiche(cotentin)]).toEqual(['CA DU COTENTIN', 'Manche · AEP-Régie · régie', 68, '/service/320874'])
    expect([anonyme.nom, precision(anonyme, D)]).toEqual(['555', '971'])
  })
  it('réseaux : département tiré du code SISE, communes desservies accordées', () => {
    const r = entreesReseaux({ c: ['035004230', '971000123', '02A000100'], n: ['CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', 'RESEAU EXEMPLE', 'AJACCIO'], k: [12, 1, 2] })
    expect(r.map((e) => e.dept)).toEqual(['35', '971', '2A'])
    expect(precision(r[0], D)).toBe('Ille-et-Vilaine · 12 communes desservies')
    expect(precision(r[1], D)).toBe('971 · 1 commune desservie')
    expect(r.map(lienFiche)).toEqual(['/reseau/035004230', '/reseau/971000123', '/reseau/02A000100'])
  })
  it('les champs de la fiche survivent à l’indexation et à la recherche', () => {
    const index = indexer(entreesReseaux({ c: ['035004230'], n: ['CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES'], k: [12] }))
    expect(precision(chercher('rennes', index)[0].entrees[0], D)).toBe('Ille-et-Vilaine · 12 communes desservies')
  })
})

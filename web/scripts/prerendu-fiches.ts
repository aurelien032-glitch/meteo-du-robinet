// Fiches pré-générées (lib/prerendu.ts, relecture externe du 29/09) : dist/commune/<insee>/index.html,
// dist/reseau/<code>/index.html et dist/service/<id>/index.html, servis par GitHub Pages avec le statut 200 (au lieu du
// 404 de la page de secours), avec leur titre, leur description, leur adresse canonique et le texte de l'année par
// défaut. Écrit aussi les plans du site des fiches (sitemap-communes.xml, sitemap-reseaux.xml, sitemap-services.xml),
// qui ne listent ainsi que des pages publiées ; sitemap.xml (generate-sitemap.mjs) en est l'index. Enfin, le texte de
// l'accueil pour les robots (contenuAccueil, refonte, lot 2), dans dist/index.html, une fois les fiches écrites : elles
// partent du modèle à #root vide.
// Lancé après `vite build` et pages-statiques.mjs (postbuild), compilé par Vite en mode SSR pour réutiliser les modules
// du site tels quels : `npm run prerendu`.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { avisDuReseau, groupesAvis } from '../src/lib/avis'
import { lettresDistinctes } from '../src/lib/bilan'
import { nomCompletReseau, nomLisibleReseau } from '../src/lib/nomsReseaux'
import { comptesClasses } from '../src/lib/accueil'
import {
  accueilHtml,
  BASE,
  contenuAccueil,
  contenuCommune,
  contenuReseau,
  contenuService,
  descriptionCommune,
  descriptionReseau,
  descriptionService,
  nomService,
  pageHtml,
  sansCommentaires,
  titreCommune,
  titreReseau,
  titreService,
  type FicheCommune,
} from '../src/lib/prerendu'
import { communesDuReseau, servicesDesCommunes } from '../src/lib/reseau'
import { anneeMediane, deptsDuService, lignesReseauxService, reseauxDuService } from '../src/lib/service'
import { classeArs, declarerPartiels, type SituationsFile } from '../src/lib/situations'
import {
  deptCode,
  defaultYear,
  deptOfInsee,
  type AvisDeptFile,
  type CommuneIndexEntry,
  type DeptFile,
  type MetaFile,
  type SispeaDeptFile,
  type SispeaNationalFile,
  type SispeaServicesFile,
  type SispeaServicesIndex,
} from '../src/lib/types'

const WEB = process.cwd() // npm lance le script depuis web/
const DATA = join(WEB, 'public', 'data')
const DIST = join(WEB, 'dist')
const lire = <T>(chemin: string): T => JSON.parse(readFileSync(join(DATA, chemin), 'utf-8')) as T
const lireSiPresent = <T>(chemin: string): T | null => {
  try {
    return lire<T>(chemin)
  } catch {
    return null
  }
}

const modele = sansCommentaires(readFileSync(join(DIST, 'index.html'), 'utf-8'))
const meta = lire<MetaFile>('meta.json')
// Année affichée d'office : l'année en cours, comme les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce
// qu'il se passe actuellement ») ; un bilan partiel s'écrit « depuis le 1er janvier » (estPartiel). Aucune phrase sur les
// avis de l'année en cours n'est pré-générée : elle vieillirait.
declarerPartiels(meta.partiel ?? [])
const annee = String(defaultYear(meta))
const anneeService = annee
const situ = lire<SituationsFile>(`situations/${annee}.json`)
const situService = anneeService === annee ? situ : lire<SituationsFile>(`situations/${anneeService}.json`)
const departements = lire<{ features: { properties: { code: string; nom: string } }[] }>('geo/departements.json')
const nomsDept = new Map(departements.features.map((f) => [f.properties.code, f.properties.nom]))
const index = lire<CommuneIndexEntry[]>('communes.json')
const nomsCommunes = new Map(index.map((e) => [e.c, e.n]))
const deptDe = new Map(index.map((e) => [e.c, e.d]))
const servicesIndex = lire<SispeaServicesIndex>('sispea/services-index.json')
const nat = lire<SispeaNationalFile>('sispea/national.json')
const parNom = <T extends { nom: string }>(a: T, b: T) => a.nom.localeCompare(b.nom, 'fr')

// Fichiers départementaux (2 Mo en moyenne) : jamais tous en mémoire. Un service peut avoir des communes dans plusieurs
// départements (204 sur 10 465) : les derniers lus restent en mémoire pour eux.
const recents = new Map<string, DeptFile | null>()
function fichierDept(dd: string): DeptFile | null {
  if (recents.has(dd)) return recents.get(dd)!
  const f = lireSiPresent<DeptFile>(`dept/${dd}.json`)
  recents.set(dd, f)
  if (recents.size > 6) recents.delete(recents.keys().next().value!)
  return f
}

const ecrites: Record<'communes' | 'reseaux' | 'services', string[]> = { communes: [], reseaux: [], services: [] }
function ecrire(genre: keyof typeof ecrites, route: string, titre: string, description: string, contenu: string) {
  const dossier = join(DIST, ...route.slice(1).split('/'))
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'index.html'), pageHtml(modele, { route, titre, description, contenu }), 'utf-8')
  ecrites[genre].push(route)
}

const communesParDept = new Map<string, CommuneIndexEntry[]>()
for (const e of index) {
  const d = deptOfInsee(e.c)
  if (!communesParDept.has(d)) communesParDept.set(d, [])
  communesParDept.get(d)!.push(e)
}
const servicesParDept = new Map<string, string[]>()
for (const [id, e] of Object.entries(servicesIndex)) {
  if (!e[1]) continue // sans département : la page le dit, rien à pré-générer (Service.tsx, routageService)
  if (!servicesParDept.has(e[1])) servicesParDept.set(e[1], [])
  servicesParDept.get(e[1])!.push(id)
}
const depts = new Set([
  ...readdirSync(join(DATA, 'dept')).map((f) => f.replace(/\.json$/, '')),
  ...communesParDept.keys(),
  ...servicesParDept.keys(),
])

let sansDonnee = 0
for (const dept of depts) {
  const fichier = fichierDept(dept)
  const avis = lireSiPresent<AvisDeptFile>(`avis/${dept}.json`)
  const nomDept = nomsDept.get(dept) ?? dept

  // Communes : comme pages/Commune.tsx.
  for (const e of communesParDept.get(dept) ?? []) {
    const c = fichier?.communes[e.c]
    const codes = c?.reseaux[annee] ?? []
    const info = (r: string) => fichier?.reseaux[r]
    // Noms lisibles, comme la page : la commune à plusieurs réseaux perd son nom en tête (lib/nomsReseaux).
    const nomReseau = (r: string) => nomLisibleReseau(info(r)?.nom ?? r, codes.length > 1 ? e.n : undefined)
    const fiche: FicheCommune = {
      code: e.c,
      nom: e.n,
      dept,
      nomDept,
      annee,
      stats: c?.stats[annee],
      reseaux: codes.map((r) => ({ code: r, nom: nomReseau(r), situation: situ.reseaux[r] ?? null, ars: classeArs(situ, r) })),
      distributeurs: [...new Set(codes.map((r) => info(r)?.dist).filter((d): d is string => !!d))],
      avis: avis ? groupesAvis(avis.communes[e.c] ?? [], avis.textes, annee) : [],
    }
    if (!c) sansDonnee++
    ecrire('communes', `/commune/${e.c}`, titreCommune(e.n, dept), descriptionCommune(e.n, annee, lettresDistinctes(fiche.reseaux)), contenuCommune(fiche))
  }

  // Réseaux : comme pages/Reseau.tsx, qui lit le réseau dans le fichier du département de son code. Les avis sont
  // d'abord regroupés par réseau : avisDuReseau parcourt toutes les communes du fichier à chaque appel.
  if (fichier) {
    const sispeaDept = lireSiPresent<SispeaDeptFile>(`sispea/dept/${dept}.json`)
    const avisParReseau = new Map<string, AvisDeptFile['communes']>()
    for (const [commune, lignes] of Object.entries(avis?.communes ?? {}))
      for (const l of lignes) {
        const m = avisParReseau.get(l[2]) ?? {}
        ;(m[commune] ??= []).push(l)
        avisParReseau.set(l[2], m)
      }
    for (const [code, r] of Object.entries(fichier.reseaux)) {
      if (deptCode(code.slice(0, 3)) !== dept) continue
      const communes = communesDuReseau(fichier, code, annee)
      // Même nom que la page du réseau (nomCompletReseau : la commune de tête sous sa forme officielle).
      const nom = nomCompletReseau(r.nom, communes.map((c) => nomsCommunes.get(c) ?? fichier.communes[c]?.nom ?? c)) || code
      const ars = classeArs(situ, code)
      ecrire(
        'reseaux',
        `/reseau/${code}`,
        titreReseau(nom),
        descriptionReseau(nom, code, annee, ars?.classe),
        contenuReseau({
          code,
          nom,
          dept,
          nomDept,
          annee,
          stats: r.stats?.[annee],
          situation: situ.reseaux[code] ?? null,
          ars,
          avis: avis ? groupesAvis(avisDuReseau(avisParReseau.get(code) ?? {}, code), avis.textes, annee) : [],
          communes: communes.map((c) => ({ code: c, nom: nomsCommunes.get(c) ?? fichier.communes[c]?.nom ?? c })).sort(parNom),
          services: servicesDesCommunes(sispeaDept, communes),
          dist: r.dist,
          uge: r.uge,
        }),
      )
    }
  }

  // Services : comme pages/Service.tsx, avec les réseaux de toutes les communes du service.
  const ids = servicesParDept.get(dept) ?? []
  const services = ids.length ? lireSiPresent<SispeaServicesFile>(`sispea/services/${dept}.json`) : null
  for (const id of ids) {
    const s = services?.[id]
    if (!s) continue
    const communesService = s.communes ?? []
    const fichiers = deptsDuService(communesService, deptDe)
      .map(fichierDept)
      .filter((f): f is DeptFile => !!f)
    const reseaux = reseauxDuService(communesService, fichiers, anneeService)
    const natAnnee = anneeMediane(nat, s.annee_ind)
    const nom = nomService(s, id)
    ecrire(
      'services',
      `/service/${id}`,
      titreService(nom),
      descriptionService(nom, s.sans_declaration),
      contenuService({
        id,
        s,
        nomDept: nomsDept.get(s.dept ?? '') ?? s.dept ?? 'département',
        annee: anneeService,
        mediane: natAnnee ? { annee: natAnnee, valeurs: nat.annees[natAnnee] } : undefined,
        reseaux: lignesReseauxService(reseaux, situService, anneeService, nomsCommunes),
        situations: Object.fromEntries(reseaux.map((r) => [r.code, situService.reseaux[r.code]])),
        communes: communesService.map((c) => ({ code: c, nom: nomsCommunes.get(c) ?? c })).sort(parNom),
      }),
    )
  }
}

// Plans du site des fiches, un par genre (50 000 adresses au plus par fichier) : exactement les pages écrites.
for (const [genre, routes] of Object.entries(ecrites)) {
  if (routes.length > 50000) throw new Error(`prerendu : ${routes.length} ${genre}, plus que les 50 000 adresses d'un plan du site`)
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    routes.map((r) => `  <url><loc>${BASE}${r}/</loc></url>`).join('\n') +
    `\n</urlset>\n`
  writeFileSync(join(DIST, `sitemap-${genre}.xml`), xml, 'utf-8')
}
console.log(
  `fiches pré-générées, bilan ${annee} (services ${anneeService}) : ${ecrites.communes.length} communes (${sansDonnee} sans donnée du contrôle sanitaire), ` +
    `${ecrites.reseaux.length} réseaux, ${ecrites.services.length} services`,
)

// Accueil : le modèle (adresse canonique de l'accueil, posée par pages-statiques.mjs) et son texte, bilan de la dernière
// année complète compris, calculé comme la carte « Bilan » de la page.
// L'accueil, comme les fiches, sur l'année en cours (Home.tsx, anneeBilan ; auteur, 2026-10-06).
writeFileSync(join(DIST, 'index.html'), accueilHtml(modele, contenuAccueil({ annee, comptes: comptesClasses(situ) })), 'utf-8')
console.log(`accueil pré-généré : bilan ${annee}`)

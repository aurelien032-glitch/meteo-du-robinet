import {
  CHAPEAU_ACCUEIL,
  dateBilan,
  PAGES_RESSOURCE,
  partClasse,
  PHRASE_CLASSES,
  PHRASE_RESSOURCE,
  PRUDENCE_AVIS,
  SUJETS_ACCUEIL,
  titreBilan,
  type ComptesClasses,
} from './accueil'
import { periode, type GroupeAvis } from './avis'
import { LETTRES_ARS, LIBELLES_ARS, lignesBilan, NOTE_LIBELLES_ARS, phraseBilan, RESEAU_DU_LOGEMENT } from './bilan'
import {
  comptes,
  CONSTAT_DEPASSEMENT,
  liste,
  MISE_EN_GARDE_ARS,
  ordreReseaux,
  phraseVerdict,
  RAPPEL_DEPASSEMENT,
  renvoiAvis,
  texteVerdict,
  tonBulletin,
  type ReseauBulletin,
} from './bulletin'
import { citationPage, CONCEPTION, LICENCE } from './citation'
import { fmt, majuscule } from './data'
import { INDICATEURS_SERVICE, phraseNotesReseaux, type LigneReseauService } from './service'
import { libelleMode, modeGestion, renseigne } from './sispea'
import { estPartiel, synthese, type LettreArs } from './situations'
import { AVIS_LIBELLE, bilanDe, type CommuneYearStats, type SispeaService, type SispeaYear } from './types'

/**
 * Fiches servies en fichiers HTML (relecture externe du 29/09) : GitHub Pages ne connaît que les fichiers publiés, et
 * répondait 404 aux adresses /commune/<insee>, /reseau/<code> et /service/<id>, que les moteurs de recherche tiennent
 * alors pour inexistantes ; le contenu, produit dans le navigateur, échappait en outre aux robots qui n'exécutent pas
 * le JavaScript. Chaque fiche reçoit son fichier (scripts/prerendu-fiches.ts), avec le titre et la description de la
 * page (usePageTitle des pages, mêmes fonctions), son adresse canonique, et le texte de l'année par défaut dans #root,
 * calculé par les fonctions des pages (lib/bulletin.ts, lib/service.ts) : le même verdict, mot pour mot.
 * L'application remplace ce contenu dès son chargement.
 */

export const BASE = 'https://meteodurobinet.fr'

/** Titre de la fiche commune, sans le nom du site (usePageTitle l'ajoute). */
export const titreCommune = (nom: string, dept: string) => `${nom} (${dept}) · eau du robinet`

/**
 * Lettres calculées d'un bilan, dans une description : « note calculée C selon la méthode de l'ARS (bilan 2025) »,
 * « notes calculées A et C … » (refonte, lot 1, 2026-10-05) ; vide sans classe.
 */
function classesCalculees(annee: string | undefined, lettres: readonly LettreArs[]): string {
  if (!lettres.length) return ''
  return `${lettres.length > 1 ? 'notes calculées' : 'note calculée'} ${liste(lettres)} selon la méthode de l'ARS${annee ? ` (bilan ${annee})` : ''}`
}

/** Description de la fiche commune (balise description et aperçus de partage), avec les lettres calculées du bilan affiché. */
export const descriptionCommune = (nom: string, annee?: string, lettres: readonly LettreArs[] = []) =>
  lettres.length
    ? `Qualité de l'eau du robinet à ${nom} : ${classesCalculees(annee, lettres)} ; pesticides, nitrates, PFAS, service d'eau et restrictions sécheresse.`
    : `Qualité de l'eau du robinet à ${nom} : conformité, pesticides, nitrates, PFAS, service d'eau et restrictions sécheresse.`

export const titreReseau = (nom: string) => `Réseau ${nom} · eau du robinet`
export const descriptionReseau = (nom: string, code: string, annee?: string, lettre?: LettreArs | null) =>
  lettre
    ? `Qualité de l'eau du réseau de distribution ${nom} (${code}) : ${classesCalculees(annee, [lettre])} ; analyses et communes desservies.`
    : `Qualité de l'eau du réseau de distribution ${nom} (${code}) : conformité, analyses et communes desservies.`

/** Ligne sous le nom d'une commune : « Aisne · l’eau y est distribuée par 3 réseaux ». */
export const enteteLieu = (nomDept: string, reseaux: number) =>
  reseaux ? `${nomDept} · l’eau y est distribuée par ${reseaux === 1 ? 'un réseau' : fmt.nb(reseaux, 'réseau', 'réseaux')}` : nomDept

/** Ligne sous le nom d'un réseau : « Aisne · ce réseau dessert 2 communes ». */
export const enteteReseau = (nomDept: string, communes: number) =>
  communes ? `${nomDept} · ce réseau dessert ${communes === 1 ? 'une commune' : fmt.nb(communes, 'commune')}` : nomDept

/** Nom d'un service : sa collectivité, à défaut son entité, à défaut son identifiant. */
export const nomService = (s: SispeaService, id: string) => renseigne(s.coll) ?? renseigne(s.nom) ?? id
export const titreService = (nom: string) => `${nom} · service d’eau`
export const descriptionService = (nom: string, sansDeclaration?: boolean) =>
  sansDeclaration
    ? `Service d'eau potable ${nom} : réseaux et communes desservies ; aucune déclaration à la SISPEA.`
    : `Service d'eau potable ${nom} : prix, indicateurs SISPEA, réseaux et communes desservies.`

/** Adresse canonique d'une page du site : barre finale, sans paramètre (l'année s'ajoute dans l'adresse). */
export const adresseCanonique = (route: string) => `${BASE}${route.replace(/\/?$/, '/')}`

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const p = (html: string, classe?: string) => `<p${classe ? ` class="${classe}"` : ''}>${html}</p>`
const ul = (items: readonly string[]) => ['<ul>', ...items.map((i) => `<li>${i}</li>`), '</ul>'].join('\n')
const lien = (href: string, texte: string) => `<a href="${href}">${echapper(texte)}</a>`
const page = (lignes: readonly string[]) => ['<main class="page prerendu">', ...lignes, '</main>'].join('\n')
const pied = (dept: string, nomDept: string) =>
  p(`${lien(`/departement/${dept}/`, `Fiche du département : ${nomDept} (${dept})`)} · <a href="/methode/#lire-bulletin">Lire un bulletin</a>`)

/**
 * Bilan de l'année, comme la carte « Bilan » des fiches (components/BilanClasses.tsx) : la classe calculée de chaque
 * réseau et sa cause, la mise en garde, les comptes ; puis « Le détail par famille », comme le bulletin
 * (components/Bulletin.tsx) : verdict, phrase d'appui, rappel sous « non conforme », avis de l'ARS d'une année close.
 * Aucune phrase sur les avis de l'année en cours, qui vieillirait (refonte, lot 1, 2026-10-05). `lieu` : « à Bordeaux »,
 * « sur ce réseau » ; `vide` : la phrase d'une année sans prélèvement.
 */
function bilan(o: { annee: string; stats?: CommuneYearStats; reseaux: ReseauBulletin[]; avis: GroupeAvis[]; lieu: string; vide: string; desservi: string }): string[] {
  const plusieurs = o.reseaux.length > 1
  const blocs: string[] = [`<h2>La qualité de l’eau en ${o.annee}</h2>`, p(echapper(phraseBilan(plusieurs)))]
  if (!o.stats) return [...blocs, p(echapper(o.vide))]
  const lignes = lignesBilan(ordreReseaux(o.reseaux), o.annee).map((l) => {
    const classe = l.lettre ? `<strong>Note ${l.lettre}</strong> (${LIBELLES_ARS[l.lettre]}*)` : '<strong>Pas de note</strong>'
    return `${classe} · ${plusieurs ? `${echapper(l.nom)} : ` : ''}${echapper(l.cause)}`
  })
  blocs.push(plusieurs ? ul(lignes) : p(lignes[0] ?? ''))
  if (plusieurs) blocs.push(p(echapper(RESEAU_DU_LOGEMENT)))
  blocs.push(p(echapper(NOTE_LIBELLES_ARS), 'cap'), p(echapper(MISE_EN_GARDE_ARS), 'cap'))
  const c = comptes(o.stats)
  if (c) {
    const depasse = c.depassements
      ? ` ; ${fmt.nb(c.depassements, 'analyse a dépassé', 'analyses ont dépassé')} une limite de qualité`
      : ' ; aucune n’a dépassé une limite de qualité'
    blocs.push(
      p(
        `${estPartiel(o.annee) ? `Depuis le 1er janvier ${o.annee}` : `En ${o.annee}`}, le contrôle sanitaire a réalisé ${fmt.nb(c.prelevements, 'prélèvement', 'prélèvements')} et ${fmt.nb(c.analyses, 'analyse', 'analyses')} ${echapper(o.lieu)}${depasse}.`,
      ),
    )
  }
  // Le détail par famille : le verdict du bulletin, mot pour mot.
  const s = synthese(o.reseaux.map((r) => r.situation))
  const avis = estPartiel(o.annee) ? [] : o.avis
  blocs.push('<h3>Le détail par famille</h3>')
  blocs.push(p(`<strong>${echapper(phraseVerdict(s, o.annee) ?? `Aucune famille analysée en ${o.annee}`)}</strong>`, 'b-verdict'))
  const texte = texteVerdict(o.reseaux, o.desservi, o.annee)
  if (texte) blocs.push(p(echapper(texte)))
  if (tonBulletin(s) === 'warn') blocs.push(p(`${CONSTAT_DEPASSEMENT} ${avis.length ? renvoiAvis(o.annee) : RAPPEL_DEPASSEMENT}`, 'cap'))
  // Avis d'une année close, comme la rubrique du bulletin. Sans avis, rien n'est écrit : l'absence d'avis publié ne vaut
  // pas « aucun avis » là où l'ARS ne renseigne pas ses conclusions (règle « pas d'information »).
  if (avis.length) {
    blocs.push(`<h3>Avis de l’ARS en ${o.annee}</h3>`)
    blocs.push(
      ul(
        avis.map((a) => {
          const details = [majuscule(periode(a.debut, a.fin)), fmt.nb(a.n, 'prélèvement')]
          if (a.causes.length) details.push(a.causes.join(', '))
          if (a.local) details.push('limité à un bâtiment, un point d’usage ou au seul point de prélèvement')
          return `<strong>${majuscule(AVIS_LIBELLE[a.cat])}</strong> · ${echapper(details.join(' · '))}`
        }),
      ),
    )
  }
  return blocs
}

export interface FicheCommune {
  code: string
  nom: string
  dept: string
  nomDept: string
  /** année par défaut de la fiche (types.dernierComplet : la dernière année complète, refonte du 2026-10-05) */
  annee: string
  /** comptes de l'année ; absent sans prélèvement cette année-là */
  stats?: CommuneYearStats
  /** réseaux qui desservent la commune cette année, noms lisibles (lib/nomsReseaux), situation et classe calculée */
  reseaux: ReseauBulletin[]
  /** distributeurs déclarés au contrôle sanitaire (réseaux.dist), une fois chacun */
  distributeurs: string[]
  /** avis de l'ARS de l'année (avis.groupesAvis), comme le bulletin ; écrits pour une année close seulement */
  avis: GroupeAvis[]
}

/** Texte de la fiche commune, placé dans #root : en-tête, bilan de l'année, détail par famille, liens. */
export function contenuCommune(f: FicheCommune): string {
  const blocs = bilan({
    annee: f.annee,
    stats: f.stats,
    reseaux: f.reseaux,
    avis: f.avis,
    lieu: `à ${f.nom}`,
    vide: `Aucun prélèvement du contrôle sanitaire n’est enregistré à ${f.nom} en ${f.annee}.`,
    desservi: 'la commune',
  })
  if (f.stats && f.distributeurs.length) blocs.push(p(`Distributeur (contrôle sanitaire) : ${echapper(liste(f.distributeurs))}.`))
  return page([
    `<h1>${echapper(f.nom)}</h1>`,
    p(echapper(enteteLieu(f.nomDept, f.reseaux.length)), 'meta'),
    p(`Code INSEE ${f.code} · ${lien(`/commune/${f.code}/analyses/`, 'Toutes les analyses')}`),
    ...blocs,
    pied(f.dept, f.nomDept),
  ])
}

export interface FicheReseau {
  code: string
  nom: string
  dept: string
  nomDept: string
  annee: string
  /** comptes du réseau pour l'année ; absent sans prélèvement */
  stats?: CommuneYearStats
  /** code de situation de l'année (situations/<année>.json) */
  situation: string | null
  /** classe A–D selon la méthode de l'ARS (situations.classeArs) */
  ars?: ReseauBulletin['ars']
  /** avis de l'ARS de l'année, écrits pour une année close seulement */
  avis: GroupeAvis[]
  /** communes desservies l'année (reseau.communesDuReseau), triées par nom */
  communes: { code: string; nom: string }[]
  /** services d'eau de ces communes (reseau.servicesDesCommunes) */
  services: { id: string | null; nom: string; entite: string | null }[]
  dist: string | null
  uge: string | null
}

/** Texte de la fiche réseau : en-tête, bulletin du réseau, « Où arrive cette eau ? », liens. */
export function contenuReseau(f: FicheReseau): string {
  const n = f.communes.length
  const ou: string[] = ['<h2>Où arrive cette eau ?</h2>']
  ou.push(p(n ? `${fmt.nb(n, 'commune desservie', 'communes desservies')} en ${f.annee} :` : `Aucune commune desservie en ${f.annee}.`))
  if (n) ou.push(ul(f.communes.map((c) => lien(`/commune/${c.code}/`, c.nom))))
  if (f.services.length) {
    ou.push(p(f.services.length > 1 ? 'Services d’eau (SISPEA) :' : 'Service d’eau (SISPEA) :'))
    ou.push(ul(f.services.map((s) => (s.id ? lien(`/service/${s.id}/`, s.nom) : echapper(s.nom)) + (s.entite ? ` · ${echapper(s.entite)}` : ''))))
  }
  const gestion = f.uge && f.uge !== f.dist ? f.uge : null
  if (f.dist) ou.push(p(`Distributeur (contrôle sanitaire) : ${echapper(f.dist)}.`))
  if (gestion) ou.push(p(`Unité de gestion (contrôle sanitaire) : ${echapper(gestion)}.`))
  return page([
    p('Réseau de distribution', 'kind'),
    `<h1>${echapper(f.nom)}</h1>`,
    p(echapper(enteteReseau(f.nomDept, n)), 'meta'),
    p(`Code du réseau ${f.code}`),
    ...bilan({
      annee: f.annee,
      stats: f.stats,
      reseaux: [{ code: f.code, nom: f.nom, situation: f.situation, ars: f.ars }],
      avis: f.avis,
      lieu: 'sur ce réseau',
      vide: `Aucun prélèvement du contrôle sanitaire n’est rattaché à ce réseau en ${f.annee}.`,
      desservi: 'la commune',
    }),
    ...ou,
    pied(f.dept, f.nomDept),
  ])
}

export interface FicheService {
  id: string
  s: SispeaService
  nomDept: string
  /** année du contrôle sanitaire (types.defaultYear) */
  annee: string
  /** médiane France de comparaison (service.anneeMediane) */
  mediane?: { annee: string; valeurs: SispeaYear }
  /** réseaux de l'année, triés comme la page (service.lignesReseauxService) */
  reseaux: LigneReseauService[]
  /** codes de situation des réseaux (situations/<année>.json), pour la phrase d'agrégat */
  situations: Record<string, string | null | undefined>
  communes: { code: string; nom: string }[]
}

/** Texte de la fiche service : déclaration SISPEA, réseaux de l'année, communes, liens. */
export function contenuService(f: FicheService): string {
  const { s } = f
  const nom = nomService(s, f.id)
  const entite = renseigne((s.nom ?? '').replace(/^\s*eau potable\s*:?\s*/i, ''))
  const meta = [renseigne(s.coll) ? entite : null, f.nomDept, `${fmt.nb(f.communes.length, 'commune')} (composition ${s.annee_communes ?? '–'})`]
  const blocs: string[] = [`<h2>Le service · ${s.sans_declaration ? `composition ${s.annee_communes ?? '–'}` : `SISPEA ${s.annee_ind ?? '–'}`}</h2>`]
  const prix = s.ind?.['D102.0']
  if (prix != null) blocs.push(p(`<strong>${fmt.dec(prix, 2)} €</strong> le m³ toutes taxes comprises, pour 120 m³ par an.`))
  const mode = libelleMode(modeGestion(s.mode))
  const exploitant = renseigne(s.op)
  if (mode || exploitant) blocs.push(p(echapper([mode, exploitant ? `Exploitant : ${exploitant}` : null].filter(Boolean).join(' · '))))
  if (s.pop != null)
    blocs.push(
      p(
        `${fmt.int(s.pop)} habitants desservis, d’après la population déclarée par le service. Ce chiffre porte sur l’ensemble du service et ne correspond pas à la population d’un réseau.`,
      ),
    )
  if (s.sans_declaration) {
    blocs.push(
      p(
        echapper(
          `Aucune déclaration de ce service ne figure à la SISPEA ; aucun prix ni aucun indicateur n’est donc publié. Il figure dans la composition communale de ${s.annee_communes ?? '–'}${renseigne(s.statut) ? ` (statut : « ${s.statut} »)` : ''}.`,
        ),
      ),
    )
  } else {
    const lignes = INDICATEURS_SERVICE.filter((r) => s.ind?.[r.code] != null)
    if (!lignes.length) blocs.push(p(echapper(`Indicateurs non publiés (${s.statut ?? 'statut inconnu'}).`)))
    else {
      const med = f.mediane
      blocs.push(
        [
          '<table>',
          `<caption>Indicateurs SISPEA du service en ${s.annee_ind}, face à la médiane France${med && med.annee !== String(s.annee_ind) ? ` (${med.annee})` : ''}</caption>`,
          '<thead><tr><th>Indicateur</th><th>Ce service</th><th>Médiane France</th></tr></thead>',
          '<tbody>',
          ...lignes.map(
            (r) =>
              `<tr><td>${r.label}</td><td>${fmt.indic(s.ind![r.code], r.unit)} ${r.unit}</td><td>${med ? `${fmt.indic(med.valeurs[r.nat].p50, r.unit)} ${r.unit}` : '–'}</td></tr>`,
          ),
          '</tbody>',
          '</table>',
        ].join('\n'),
      )
    }
  }
  blocs.push(`<h2>Ses réseaux en ${f.annee}</h2>`)
  if (!f.reseaux.length) blocs.push(p(`Aucun réseau n’est rattaché aux communes du service en ${f.annee}.`))
  else {
    blocs.push(p(`${echapper(phraseNotesReseaux(f.reseaux))}.`))
    blocs.push(
      ul(
        f.reseaux.map(
          (l) => `${lien(`/reseau/${l.r.code}/`, l.nom)} · <strong>${l.lettre ? `Note ${l.lettre}` : 'Pas de note'}</strong>${l.lettre ? ` (${LIBELLES_ARS[l.lettre]}*)` : ''} — ${echapper(l.cause)}`,
        ),
      ),
    )
    blocs.push(p(echapper(MISE_EN_GARDE_ARS), 'cap'))
  }
  blocs.push('<h2>Communes desservies</h2>')
  blocs.push(p(`Composition du service selon la SISPEA (${s.annee_communes ?? '–'}).`))
  if (f.communes.length) blocs.push(ul(f.communes.map((c) => lien(`/commune/${c.code}/`, c.nom))))
  return page([
    p('Service d’eau potable', 'kind'),
    `<h1>${echapper(nom)}</h1>`,
    p(echapper(meta.filter(Boolean).join(' · ')), 'meta'),
    ...blocs,
    s.dept ? pied(s.dept, f.nomDept) : '',
  ])
}

/**
 * Texte de l'accueil pour les robots qui n'exécutent pas le JavaScript (refonte, lot 2, 2026-10-05) : les textes de la
 * page (lib/accueil.ts), le bilan de la dernière année complète calculé comme la carte « Bilan » (comptesClasses), les
 * sujets et la ressource. Aucun chiffre des avis de l'année en cours, qui vieillirait (même règle que les fiches).
 */
export function contenuAccueil(o: { annee: string; comptes: ComptesClasses | null }): string {
  const c = o.comptes
  const bilan = c?.classes
    ? [
        `<h3>${echapper(bilanDe(o.annee, estPartiel(o.annee)))}</h3>`,
        p(echapper(dateBilan(c))),
        p(`<strong>${echapper(titreBilan(c, o.annee))}</strong>`),
        ul(LETTRES_ARS.map((l) => `${l} ${echapper(LIBELLES_ARS[l])}* : ${fmt.pct(100 * (partClasse(c, l) ?? 0), 1)} (${fmt.nb(c[l], 'réseau', 'réseaux')})`)),
        p(echapper(`${NOTE_LIBELLES_ARS} La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi et peut différer.`), 'cap'),
        p(lien('/france/', 'La France, département par département')),
      ]
    : []
  return page([
    '<h1>Quelle eau coule à votre robinet ?</h1>',
    p(echapper(CHAPEAU_ACCUEIL), 'lead'),
    p(lien('/ma-commune/', 'Rechercher une commune par son nom ou son code postal')),
    '<h2>L’eau en France</h2>',
    '<h3>Les avis de l’ARS</h3>',
    p(echapper(PRUDENCE_AVIS)),
    p(lien('/avis/', 'La carte des avis de l’ARS')),
    ...bilan,
    '<h2>Comprendre</h2>',
    ul(SUJETS_ACCUEIL.map((s) => `${lien(`${s.to}/`, s.titre)} · ${echapper(s.texte)}`)),
    `<h2>${lien('/ressource-en-eau/', 'Autour de l’eau du robinet')}</h2>`,
    p(echapper(PHRASE_RESSOURCE)),
    ul(PAGES_RESSOURCE.map((s) => `${lien(`${s.to}/`, s.titre)} · ${echapper(s.texte)}`)),
    p(`${echapper(PHRASE_CLASSES)} ${lien('/methode/#classe-ars', 'Méthode')} · ${lien('/mentions-legales/', 'Mentions légales')}`),
  ])
}

/**
 * Modèle des pages pré-générées sans ses commentaires (choix de l'auteur, 2026-10-05) : environ 900 octets de notes
 * techniques répétés dans 70 000 pages (60 Mo, pour une limite de 1 Go chez GitHub Pages). Retire les commentaires
 * HTML, et dans les scripts (hors JSON-LD) les blocs `/* … *\/` et les lignes `// …` ; le code et les données restent.
 */
export function sansCommentaires(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script(?![^>]*application\/ld\+json)[^>]*>)([\s\S]*?)(<\/script>)/g, (_, ouv: string, code: string, ferm: string) =>
      ouv + code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') + ferm,
    )
    .replace(/\n\s*\n+/g, '\n')
}

/** dist/index.html de l'accueil : le modèle, son texte dans #root. Échoue si #root n'est plus vide (index.html modifié). */
export function accueilHtml(modele: string, contenu: string): string {
  if (!modele.includes('<div id="root"></div>')) throw new Error('prerendu : div#root vide introuvable dans dist/index.html')
  return modele.replace('<div id="root"></div>', () => `<div id="root">${contenu}</div>`)
}

/**
 * Page HTML d'une route, tirée de dist/index.html : titre, description, aperçus de partage, adresse canonique et,
 * s'il est donné, le contenu placé dans #root. Échoue si une balise attendue manque (index.html modifié sans ce module).
 */
export function pageHtml(modele: string, o: { route: string; titre: string; description: string; contenu?: string }): string {
  const t = echapper(`${o.titre} · Météo du robinet`)
  const d = echapper(o.description)
  const u = echapper(adresseCanonique(o.route))
  const remplacer = (html: string, motif: RegExp, valeur: string, nom: string) => {
    if (!motif.test(html)) throw new Error(`prerendu : balise ${nom} introuvable dans dist/index.html`)
    return html.replace(motif, () => valeur)
  }
  let h = modele
  h = remplacer(h, /<title>[^<]*<\/title>/, `<title>${t}</title>`, 'title')
  h = remplacer(h, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`, 'description')
  h = remplacer(h, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`, 'og:title')
  h = remplacer(h, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`, 'og:description')
  h = remplacer(h, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${u}" />`, 'og:url')
  // Le modèle porte l'adresse canonique de l'accueil (pages-statiques.mjs) : elle est remplacée, jamais doublée.
  h = h.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/, '')
  h = remplacer(h, /<\/head>/, `  <link rel="canonical" href="${u}" />\n  </head>`, '</head>')
  if (o.contenu) h = remplacer(h, /<div id="root"><\/div>/, `<div id="root">${o.contenu}</div>`, 'div#root')
  // Citation de la page, lue par les robots et les agents qui n'exécutent pas le JavaScript (auteur, 2026-10-07, « il faut
  // que les agents IA me citent s'ils utilisent mon site ») : la forme demandée, le titre et l'adresse de la page.
  const citer = `<p>Pour citer cette page : ${echapper(citationPage(`${o.titre} · Météo du robinet`, adresseCanonique(o.route)))}. Licence <a href="${LICENCE.url}" rel="license">${LICENCE.nom}</a>. ${echapper(CONCEPTION.texte)} : <a href="${CONCEPTION.url}">hydroforge.fr/dataviz</a>.</p>`
  if (/<footer class="prerendu">/.test(h)) h = h.replace(/(<footer class="prerendu">)/, () => `<footer class="prerendu">\n      ${citer}`)
  return h
}

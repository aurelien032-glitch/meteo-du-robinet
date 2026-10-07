import { classable } from './classement'
import { fmt } from './data'
import { libelleParametre } from './parametres'
import {
  CANALISATIONS,
  classesNonConformes,
  libelleClasse,
  MATERIAUX,
  nbClasses,
  nonConformes,
  reseauxAnalyses,
  SEUIL_BACT,
  SEUIL_JOURS_PESTICIDES,
  SEUILS_NITRATES,
  toneSituation,
  type FamilleSitu,
  type Repartition,
  type SituationsFile,
  type Ton,
} from './situations'
import { deptCode, type AvisCat, type AvisNationalFile, type HorsGrilleFile, type ParamsFile, type SeriesFile, type ThemeFile } from './types'

/**
 * Pages de sujets (refonte, lot 4, règles de l'auteur du 2026-10-05) : ce que mesure le contrôle sanitaire, d'après les
 * textes officiels cités, puis les comptes de RÉSEAUX de chaque famille selon la méthode de son bilan (lib/situations.ts).
 * Prudence juridique : aucune recommandation sanitaire, aucun effet sanitaire avancé par le site, aucune affirmation sur
 * l'origine d'une pollution en un lieu, aucun responsable désigné, aucun palmarès (tableaux alphabétiques, tri au choix).
 * Les textes se lisent ici ; les pages les affichent (pages/Theme.tsx, pages/Plomb.tsx, pages/Themes.tsx).
 */

// --- Les sujets -----------------------------------------------------------------------------------------------------

export interface Sujet {
  to: string
  titre: string
  /** une phrase neutre, sans affirmation causale */
  texte: string
}

/**
 * Les sujets, dans l'ordre de l'accueil (maquette du 2026-10-05) : les six de l'accueil, puis les métaux et minéraux, la
 * radioactivité et les substances sans limite de qualité. La famille « autres limites de qualité » n'a pas de page.
 */
export const SUJETS: readonly Sujet[] = [
  { to: '/themes/pfas', titre: 'PFAS et TFA', texte: 'La limite de qualité porte sur la somme de 20 PFAS ; le TFA n’a pas de limite propre.' },
  { to: '/themes/pesticides', titre: 'Pesticides', texte: 'Substances actives et métabolites recherchés, limites de qualité et durée des dépassements.' },
  { to: '/themes/nitrates', titre: 'Nitrates', texte: `Concentration maximale de l’année, comparée à la limite de qualité de ${SEUILS_NITRATES[2]} mg/L.` },
  { to: '/themes/bacteries', titre: 'Bactéries', texte: 'Bactéries témoins d’une contamination fécale, prélèvements non conformes et consignes d’ébullition.' },
  { to: '/themes/plomb', titre: 'Plomb et canalisations', texte: 'Plomb, cuivre et nickel mesurés au robinet ; ils dépendent des canalisations intérieures.' },
  { to: '/avis', titre: 'Avis de l’ARS', texte: 'Restrictions de consommation, consignes d’ébullition et recommandations publiées par l’ARS.' },
  { to: '/themes/metaux', titre: 'Métaux et minéraux', texte: 'Arsenic, fluorures, sélénium et autres éléments comparés à leur limite de qualité.' },
  { to: '/themes/radioactivite', titre: 'Radioactivité', texte: 'Analyses comparées aux références de qualité, sans caractère obligatoire.' },
  { to: '/hors-grille', titre: 'Substances sans limite de qualité', texte: 'TFA, perchlorate et autres substances recherchées sans limite de qualité.' },
]

/** Description de la page « Sujets », reprise par les pages statiques (scripts/routes-statiques.mjs). */
export const DESCRIPTION_SUJETS =
  'Les sujets de l’eau du robinet : PFAS et TFA, pesticides, nitrates, bactéries, plomb et canalisations, avis de l’ARS, métaux et minéraux, radioactivité, substances sans limite de qualité.'

/** Titres et descriptions des pages de thème, ceux du site (le pipeline garde les siens dans meta.themes). */
export const PAGES_THEMES: Record<string, { titre: string; description: string }> = {
  pfas: {
    titre: 'PFAS et TFA',
    description: 'Somme de 20 PFAS et sa limite de qualité de 0,1 µg/L, réseau par réseau ; TFA, sans limite de qualité propre : recherche et quantifications.',
  },
  pesticides: {
    titre: 'Pesticides',
    description: 'Pesticides et métabolites dans l’eau du robinet : limites de qualité, réseaux non conformes selon la durée des dépassements, par département.',
  },
  nitrates: {
    titre: 'Nitrates',
    description: 'Nitrates dans l’eau du robinet : concentration maximale de l’année et limite de qualité de 50 mg/L, réseau par réseau et par département.',
  },
  bacteries: {
    titre: 'Bactéries',
    description: 'Bactériologie de l’eau du robinet : part des prélèvements non conformes et consignes de l’ARS, réseau par réseau et par département.',
  },
  metaux: {
    titre: 'Métaux et minéraux',
    description: 'Arsenic, fluorures, sélénium et autres métaux ou minéraux dans l’eau du robinet, comparés à leur limite de qualité, par département.',
  },
  radioactivite: {
    titre: 'Radioactivité',
    description: 'Radioactivité de l’eau du robinet : analyses comparées aux références de qualité de l’arrêté du 11 janvier 2007, par département.',
  },
  plomb: {
    titre: 'Plomb et canalisations',
    description: 'Plomb, cuivre et nickel mesurés au robinet : limites de qualité, analyses et résultats publiés, hors du jugement des réseaux.',
  },
}

/** Famille des situations de chaque thème ; la radioactivité n'a pas de limite de qualité. */
export const FAMILLE_THEME: Record<string, FamilleSitu | null> = {
  pfas: 'pfas',
  pesticides: 'pesticides',
  nitrates: 'azote',
  bacteries: 'microbio',
  metaux: 'metaux_mineraux',
  radioactivite: null,
}

// --- Ce que mesure le contrôle sanitaire : les textes ---------------------------------------------------------------

export interface Reference {
  titre: string
  url?: string
}

export const REF_ARRETE: Reference = {
  titre:
    'Arrêté du 11 janvier 2007 relatif aux limites et références de qualité des eaux brutes et des eaux destinées à la consommation humaine, modifié notamment par l’arrêté du 30 décembre 2022 (annexe I)',
  url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000465574',
}
export const REF_DIRECTIVE: Reference = {
  titre: 'Directive (UE) 2020/2184 du Parlement européen et du Conseil du 16 décembre 2020 relative à la qualité des eaux destinées à la consommation humaine',
  url: 'https://eur-lex.europa.eu/eli/dir/2020/2184/oj',
}
export const REF_NOTE_2023: Reference = { titre: 'Note d’information n° DGS/EA4/2023/61 du 14 avril 2023 de la direction générale de la santé' }
export const REF_BILANS: Reference = { titre: 'Bilans de la qualité de l’eau du robinet du ministère chargé de la Santé et des agences régionales de santé' }
export const REF_NOTE_2019: Reference = { titre: 'Note d’information DGS/EA4 du 19 juillet 2019 (indicateur global de qualité joint à la facture d’eau)' }

const [N1, N2, N3] = SEUILS_NITRATES
const PCT_NC = 100 - Math.round(SEUIL_BACT * 100)

export interface Mesure {
  /** deux à quatre phrases, tirées des textes cités */
  phrases: string[]
  references: Reference[]
  /** ancre de la Méthode qui répond */
  methode: string
}

/**
 * Ce que mesure le contrôle sanitaire, sujet par sujet : définition réglementaire, valeur de la limite (ou de la
 * référence) et ce qu'elle encadre, d'après l'annexe I de l'arrêté du 11 janvier 2007 modifié ; puis la méthode de
 * jugement de la famille sur le site (lib/situations.ts). Aucun effet sanitaire n'y est avancé.
 */
export const MESURES: Record<string, Mesure> = {
  pfas: {
    phrases: [
      'L’arrêté du 11 janvier 2007 modifié fixe une limite de qualité de 0,1 µg/L pour la somme de 20 substances alkylées per- et polyfluorées (PFAS) qu’il énumère.',
      'Issue de la directive (UE) 2020/2184, cette limite s’applique depuis le 1er janvier 2023 ; la recherche de ces substances est systématique dans le contrôle sanitaire depuis le 1er janvier 2026 (note d’information DGS/EA4/2023/61).',
      'Le site compte un réseau parmi les non conformes lorsqu’un dépassement de cette limite est constaté dans l’année.',
      'Le TFA (acide trifluoroacétique) ne figure pas parmi les 20 PFAS de la somme et n’a pas de limite de qualité propre ; ses résultats sont présentés plus bas.',
    ],
    references: [REF_ARRETE, REF_DIRECTIVE, REF_NOTE_2023],
    methode: '/methode#directive-2020-2184',
  },
  pesticides: {
    phrases: [
      'L’arrêté du 11 janvier 2007 modifié fixe une limite de qualité de 0,1 µg/L par pesticide (0,03 µg/L pour l’aldrine, la dieldrine, l’heptachlore et l’époxyde d’heptachlore) et de 0,5 µg/L pour le total des pesticides.',
      'Les pesticides y désignent les substances organiques insecticides, herbicides, fongicides et apparentées, ainsi que leurs métabolites jugés pertinents. Un métabolite déclaré non pertinent par l’Anses n’est plus soumis à la limite de 0,1 µg/L.',
      `Le site juge chaque réseau selon la méthode du bilan national du ministère chargé de la Santé, en quatre situations : conforme, dépassements cumulés sur ${SEUIL_JOURS_PESTICIDES} jours au plus dans l’année, plus de ${SEUIL_JOURS_PESTICIDES} jours, restriction de consommation.`,
    ],
    references: [REF_ARRETE, REF_BILANS],
    methode: '/methode#familles',
  },
  nitrates: {
    phrases: [
      `L’arrêté du 11 janvier 2007 modifié fixe la limite de qualité des nitrates à ${N3} mg/L et celle des nitrites à 0,50 mg/L ; la somme de la concentration en nitrates divisée par 50 et de celle en nitrites divisée par 3 doit rester inférieure ou égale à 1.`,
      `Comme le bilan national du ministère chargé de la Santé, le site range chaque réseau par tranche de concentration maximale de nitrates mesurée dans l’année : moins de ${N1} mg/L, de ${N1} à ${N2} mg/L, de ${N2} à ${N3} mg/L, au-dessus de ${N3} mg/L. Seule la dernière tranche constitue une non-conformité.`,
      'Les nitrites sont jugés avec les autres limites de qualité.',
    ],
    references: [REF_ARRETE, REF_BILANS],
    methode: '/methode#familles',
  },
  bacteries: {
    phrases: [
      'L’arrêté du 11 janvier 2007 modifié fixe pour les bactéries Escherichia coli et entérocoques intestinaux une limite de qualité de 0 par 100 mL.',
      `Le site suit la méthode des bilans des ARS : pour chaque réseau, la part des prélèvements conformes en bactériologie ; la qualité est jugée bonne lorsque ${100 - PCT_NC} % au moins des prélèvements sont conformes.`,
      `Un réseau est compté parmi les non conformes lorsque plus de ${PCT_NC} % de ses prélèvements sont non conformes, ou lorsque l’ARS a prescrit une consigne d’ébullition ou une restriction de consommation.`,
    ],
    references: [REF_ARRETE, REF_BILANS],
    methode: '/methode#familles',
  },
  metaux: {
    phrases: [
      'L’arrêté du 11 janvier 2007 modifié fixe une limite de qualité pour plusieurs métaux et minéraux.',
      'Comme dans les synthèses de l’ARS, le plomb, le cuivre et le nickel, mesurés au robinet et liés aux canalisations intérieures, sont écartés du jugement des réseaux ; leurs résultats figurent sur la page « Plomb et canalisations ».',
      'Le site compte un réseau parmi les non conformes lorsqu’un dépassement d’une de ces limites est constaté dans l’année.',
    ],
    references: [REF_ARRETE, REF_NOTE_2019],
    methode: '/methode#hors-jugement',
  },
  radioactivite: {
    phrases: [
      'Pour la radioactivité, l’arrêté du 11 janvier 2007 modifié fixe des références de qualité, et non des limites : une dose indicative de 0,1 mSv par an, 100 Bq/L pour le tritium et 100 Bq/L pour le radon dans les eaux d’origine souterraine.',
      'Au-delà de 0,1 Bq/L d’activité alpha globale ou de 1 Bq/L d’activité bêta globale résiduelle, l’arrêté prévoit l’analyse des radionucléides spécifiques.',
      'Une référence de qualité est une valeur indicative : son dépassement ne constitue pas une non-conformité. Le site compte les réseaux dont au moins une analyse de l’année dépasse une référence de qualité.',
    ],
    references: [REF_ARRETE],
    methode: '/methode#limite-reference',
  },
  plomb: {
    phrases: [
      'L’arrêté du 11 janvier 2007 modifié fixe la limite de qualité du plomb à 10 µg/L au robinet du consommateur. En amont des installations privées, la limite de 10 µg/L vaut jusqu’au 31 décembre 2035 ; elle est de 5 µg/L à partir du 1er janvier 2036.',
      'Le cuivre (2 mg/L) et le nickel (20 µg/L) ont également une limite de qualité.',
      'Comme les synthèses annuelles de l’ARS, le site écarte le plomb, le cuivre et le nickel du jugement des réseaux : mesurés au robinet, ces paramètres dépendent aussi des canalisations intérieures. Leurs résultats sont publiés ci-dessous sans être jugés.',
    ],
    references: [REF_ARRETE, REF_DIRECTIVE, REF_NOTE_2019],
    methode: '/methode#hors-jugement',
  },
}

/**
 * Limites de qualité des paramètres d'une famille les plus souvent analysés (métaux et minéraux), lues dans params.json
 * (valeurs du contrôle sanitaire) : « Arsenic ≤ 10 µg/L ». Sans les sommes, ni les paramètres écartés du jugement.
 */
export function limitesFamille(params: ThemeFile['params'], infos: ParamsFile['params'], n = 6): string[] {
  const exclus = new Set<string>([...CANALISATIONS, ...MATERIAUX])
  return [...params]
    .filter((r) => !exclus.has(r.p) && infos[r.p]?.lim && !/^(total|somme)\b/i.test(r.l ?? ''))
    .sort((a, b) => b.n - a.n)
    .slice(0, n)
    .map((r) => `${libelleParametre(r.p, r.l).replace(/\s+(mg|µg|ng)\/L$/, '')} ${fmt.seuil(infos[r.p].lim)}`)
}

// --- « En ce moment » et « Bilan » ----------------------------------------------------------------------------------

/** Ce qui fait compter un réseau, dit par une phrase (règle de rédaction du 27/09 : un terme se définit par une phrase). */
export const DEF_COMPTE: Record<Exclude<FamilleSitu, 'toutes' | 'autres'>, string> = {
  pesticides: 'Un réseau est compté lorsqu’un pesticide ou le total des pesticides a dépassé sa limite de qualité, ou lorsque l’ARS a prescrit une restriction de consommation pour cette cause.',
  azote: `Un réseau est compté lorsque la concentration maximale de nitrates mesurée a dépassé ${N3} mg/L.`,
  pfas: 'Un réseau est compté lorsqu’un dépassement de la limite de qualité de la somme de 20 PFAS a été constaté.',
  microbio: `Un réseau est compté lorsque plus de ${PCT_NC} % de ses prélèvements sont non conformes en bactériologie, ou lorsque l’ARS a prescrit une consigne d’ébullition ou une restriction de consommation.`,
  metaux_mineraux: 'Un réseau est compté lorsqu’un dépassement de la limite de qualité d’un métal ou d’un minéral a été constaté, hors plomb, cuivre et nickel.',
}

/** Nom de la famille dans une phrase (« analysés pour les PFAS »). */
export const POUR_FAMILLE: Record<Exclude<FamilleSitu, 'toutes' | 'autres'>, string> = {
  pesticides: 'les pesticides',
  azote: 'les nitrates',
  pfas: 'les PFAS',
  microbio: 'la bactériologie',
  metaux_mineraux: 'les métaux et minéraux',
}

/** Définition d'un réseau analysé (l'écart entre réseaux analysés et réseaux contrôlés, relevé par l'audit du 05/10). */
export const DEF_ANALYSE = 'Un réseau est compté parmi les réseaux analysés lorsqu’au moins une analyse de la famille y a été réalisée dans l’année.'

/** Ligne de la répartition d'un bilan : une classe de la famille, son libellé de l'année, son effectif et sa part. */
export interface ClasseBilan {
  classe: number
  libelle: string
  n: number
  part: number
  ton: Ton
  nonConforme: boolean
}

export interface BilanFamille {
  analyses: number
  nonConformes: number
  /** part des réseaux non conformes (0–1) ; null sans réseau analysé */
  part: number | null
  classes: ClasseBilan[]
}

/** Bilan d'une famille pour une année : réseaux analysés, non conformes au sens de son bilan, et chaque classe. */
export function bilanFamille(r: Repartition | null | undefined, fam: FamilleSitu, annee: string | number): BilanFamille | null {
  if (!r) return null
  const analyses = reseauxAnalyses(r)
  const nc = nonConformes(r, fam)
  const nonConf = classesNonConformes(fam)
  return {
    analyses,
    nonConformes: nc,
    part: analyses ? nc / analyses : null,
    classes: Array.from({ length: nbClasses(fam) }, (_, i) => ({
      classe: i,
      libelle: libelleClasse(fam, i, annee),
      n: r[i] ?? 0,
      part: analyses ? (r[i] ?? 0) / analyses : 0,
      ton: toneSituation(fam, i),
      nonConforme: nonConf.includes(i),
    })),
  }
}

/**
 * Voyant d'un chiffre qui compte des réseaux de plusieurs classes (décision de l'auteur du 24/09) : le ton commun de ces
 * classes, ou aucun quand elles n'ont pas toutes le même (« plus de 30 jours ou restriction ») ; jamais pour un compte
 * nul ni pour une réserve.
 */
export function tonCommun(f: FamilleSitu, classes: readonly number[], n: number): Ton | undefined {
  if (!n) return undefined
  const tons = new Set(classes.map((c) => toneSituation(f, c)))
  const ton = tons.size === 1 ? [...tons][0] : undefined
  return ton === 'good' ? undefined : ton
}

/** Titre du bilan d'une famille : « 14,1 % des réseaux analysés sont non conformes ». */
export function titreBilanFamille(b: BilanFamille): string {
  if (b.part == null) return 'Aucun réseau analysé'
  return `${fmt.pct(100 * b.part, 1)} des réseaux analysés ${b.nonConformes > 1 ? 'sont non conformes' : b.nonConformes === 1 ? 'est non conforme' : 'sont non conformes'}`
}

/** Bilan de la radioactivité (références de qualité, theme.national) : réseaux au-dessus d'une référence. */
export interface BilanReferences {
  analyses: number
  auDessus: number
  part: number | null
}
export function bilanReferences(v: ThemeFile['national'][string] | undefined): BilanReferences | null {
  if (!v || v.res_tot == null) return null
  return { analyses: v.res_tot, auDessus: v.res_ref ?? 0, part: v.res_tot ? (v.res_ref ?? 0) / v.res_tot : null }
}

/** Titre du bilan de la radioactivité : « 5,6 % des réseaux analysés au-dessus d'une référence de qualité ». */
export const titreBilanReferences = (b: BilanReferences) =>
  b.part == null ? 'Aucun réseau analysé' : `${fmt.pct(100 * b.part, 1)} des réseaux analysés au-dessus d’une référence de qualité`

// --- Avis de l'ARS qui citent une cause -----------------------------------------------------------------------------

/** Causes des avis de l'ARS (avis/national.json, `causes`) qui relèvent de chaque sujet, avec leur nom dans une phrase. */
export const CAUSES_SUJET: Record<string, { cle: string; nom: string }[]> = {
  pfas: [{ cle: 'PFAS', nom: 'les PFAS' }],
  pesticides: [{ cle: 'pesticides', nom: 'les pesticides' }],
  nitrates: [{ cle: 'nitrates', nom: 'les nitrates' }],
  bacteries: [{ cle: 'bactériologie', nom: 'la bactériologie' }],
  metaux: [
    { cle: 'arsenic', nom: 'l’arsenic' },
    { cle: 'fluorures', nom: 'les fluorures' },
    { cle: 'sélénium', nom: 'le sélénium' },
  ],
  radioactivite: [{ cle: 'radioactivité', nom: 'la radioactivité' }],
  plomb: [{ cle: 'plomb', nom: 'le plomb' }],
}

const CATS: AvisCat[] = ['interdiction', 'ebullition', 'sensibles']
const QUOI_AVIS: Record<AvisCat, [string, string]> = {
  interdiction: ['prélèvement assorti d’une restriction de consommation', 'prélèvements assortis d’une restriction de consommation'],
  ebullition: ['prélèvement assorti d’une consigne d’ébullition', 'prélèvements assortis d’une consigne d’ébullition'],
  sensibles: ['prélèvement dont l’eau est déconseillée aux publics sensibles', 'prélèvements dont l’eau est déconseillée aux publics sensibles'],
}

const enumerer = (l: string[]) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`)

/**
 * Phrase des avis de l'ARS qui citent les causes d'un sujet sur une période (« depuis le 1er janvier 2026 ») : prélèvements
 * par catégorie, comme le graphique des causes de /avis. Une conclusion peut citer plusieurs causes ; chaque cause a donc
 * sa proposition. Sans avis, une phrase qui le dit. Null si le sujet n'a pas de cause relevée par le site.
 */
export function phraseAvisCause(causes: AvisNationalFile['causes'][string] | undefined, sujet: string, periode: string): string | null {
  const liste = CAUSES_SUJET[sujet]
  if (!liste || !causes) return null
  const parties = liste
    .map(({ cle, nom }) => {
      const morceaux = CATS.map((c) => [c, causes[c]?.[cle] ?? 0] as const)
        .filter(([, n]) => n > 0)
        .map(([c, n]) => `${fmt.int(n)} ${QUOI_AVIS[c][n > 1 ? 1 : 0]}`)
      return morceaux.length ? `${nom} pour ${enumerer(morceaux)}` : null
    })
    .filter((x): x is string => !!x)
  const noms = enumerer(liste.map((c) => c.nom))
  if (!parties.length)
    return `Aucune conclusion de l’ARS publiée ${periode} ne cite ${noms} parmi les causes d’une restriction de consommation, d’une consigne d’ébullition ou d’une eau déconseillée aux publics sensibles.`
  return `Les conclusions de l’ARS publiées ${periode} citent ${parties.join(' ; ')}.`
}

// --- Tableau des départements ---------------------------------------------------------------------------------------

export interface LigneSujet {
  dd: string
  nom: string
  /** réseaux analysés pour la famille (ou pour la radioactivité) */
  analyses: number
  /** réseaux non conformes, ou au-dessus d'une référence pour la radioactivité */
  comptes: number
  /** réseaux de la colonne de détail (detailSituation) ; null pour la radioactivité */
  detail: number | null
  part: number | null
  /** la part repose sur assez de réseaux pour entrer dans un tri (lib/classement.ts) */
  classable: boolean
  /** répartition de la famille (CSV) */
  r?: Repartition
}

/**
 * Lignes du tableau des départements d'une famille, une par département qui compte un réseau analysé, dans l'ordre
 * alphabétique. Effectif de la règle des classements : réseaux analysés pour la famille parmi tous les réseaux du
 * département (situations/<année>.json, réseaux analysés pour au moins une famille).
 */
export function lignesSujet(
  situ: SituationsFile | null | undefined,
  fam: FamilleSitu,
  nom: (dd: string) => string,
  detailClasses: readonly number[],
  garder: (dd: string) => boolean = () => true,
): LigneSujet[] {
  if (!situ) return []
  const totaux = new Map<string, number>()
  for (const code of Object.keys(situ.reseaux)) {
    const d = deptCode(code.slice(0, 3))
    totaux.set(d, (totaux.get(d) ?? 0) + 1)
  }
  const lignes: LigneSujet[] = []
  for (const [dd, par] of Object.entries(situ.depts)) {
    const r = par[fam]
    if (!r || !garder(dd)) continue
    const analyses = reseauxAnalyses(r)
    if (!analyses) continue
    const nc = nonConformes(r, fam)
    lignes.push({
      dd,
      nom: nom(dd),
      analyses,
      comptes: nc,
      detail: detailClasses.reduce((a, i) => a + (r[i] ?? 0), 0),
      part: nc / analyses,
      classable: classable(analyses, totaux.get(dd)),
      r,
    })
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd))
}

/** Lignes de la radioactivité, d'après le fichier du thème (réseaux au-dessus d'une référence de qualité). */
export function lignesReferences(
  t: ThemeFile | null | undefined,
  annee: string | number,
  nom: (dd: string) => string,
  totaux: ReadonlyMap<string, number>,
  garder: (dd: string) => boolean = () => true,
): LigneSujet[] {
  if (!t) return []
  const lignes: LigneSujet[] = []
  for (const [sise, parAn] of Object.entries(t.depts)) {
    const v = parAn[String(annee)]
    const dd = deptCode(sise)
    if (!v || !v.res_tot || !garder(dd)) continue
    const n = v.res_ref ?? 0
    lignes.push({ dd, nom: nom(dd), analyses: v.res_tot, comptes: n, detail: null, part: n / v.res_tot, classable: classable(v.res_tot, totaux.get(dd)) })
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd))
}

/** En-têtes du CSV d'une famille : les classes de son bilan, puis les non conformes et leur part. */
export function entetesCsvSujet(fam: FamilleSitu | null, annee: string | number): string[] {
  const tete = ['Code du département', 'Département', 'Année', 'Réseaux analysés']
  const regle = 'Part retenue dans les tris (10 réseaux au moins, ou tous)'
  if (!fam) return [...tete, 'Réseaux au-dessus d’une référence de qualité', 'Part des réseaux au-dessus d’une référence de qualité (%)', regle]
  const classes = Array.from({ length: nbClasses(fam) }, (_, i) => `Réseaux : ${libelleClasse(fam, i, annee)}`)
  return [...tete, ...classes, 'Réseaux non conformes', 'Part des réseaux non conformes (%)', regle]
}

/** Ligne du CSV d'une famille. */
export function ligneCsvSujet(l: LigneSujet, fam: FamilleSitu | null, annee: string | number): (string | number | null)[] {
  const tete = [l.dd, l.nom, String(annee), l.analyses]
  const part = l.part == null ? null : Math.round(l.part * 1000) / 10
  const classes = fam ? Array.from({ length: nbClasses(fam) }, (_, i) => l.r?.[i] ?? 0) : []
  return [...tete, ...classes, l.comptes, part, l.classable ? 'oui' : 'non']
}

// --- Avis de l'ARS et substances sans limite : tableaux alphabétiques ------------------------------------------------

export interface LigneAvis {
  dd: string
  nom: string
  /** communes rattachées à au moins un avis de l'année ; null « pas d'information » (délégation sans information, sans avis) */
  toutes: number | null
  interdiction: number
  ebullition: number
  sensibles: number
  sansInformation: boolean
}

/**
 * Lignes du tableau des départements de /avis, une par département dessiné, dans l'ordre alphabétique (refonte, lot 4 :
 * plus de classement). Un avis vise des habitants : on compte les communes rattachées, comme la carte. Un département
 * « sans information » sans avis n'a pas de valeur (règle du 24/09 : jamais « aucun avis »).
 */
export function lignesAvis(nat: AvisNationalFile | null | undefined, annee: string | number, departements: readonly (readonly [string, string])[]): LigneAvis[] {
  if (!nat) return []
  const muets = new Set(nat.sans_information?.[String(annee)] ?? [])
  return departements
    .map(([dd, nom]) => {
      const r = nat.depts[dd]?.[String(annee)] ?? {}
      const toutes = r.toutes ?? 0
      const sansInformation = muets.has(dd)
      return {
        dd,
        nom,
        toutes: toutes === 0 && sansInformation ? null : toutes,
        interdiction: r.interdiction ?? 0,
        ebullition: r.ebullition ?? 0,
        sensibles: r.sensibles ?? 0,
        sansInformation,
      }
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd))
}

export interface LigneHorsGrille {
  dd: string
  nom: string
  /** communes du département ayant des prélèvements dans l'année */
  communes: number
  cherche: number
  quantifie: number
  partCherche: number | null
  partQuantifie: number | null
}

/** Lignes du tableau des départements de /hors-grille pour un groupe et une année, dans l'ordre alphabétique. */
export function lignesHorsGrille(hg: HorsGrilleFile | null | undefined, groupe: string, annee: string | number, nom: (dd: string) => string): LigneHorsGrille[] {
  const d = hg?.depts[groupe as keyof HorsGrilleFile['depts']]?.[String(annee)] ?? {}
  return Object.entries(d)
    .map(([dd, [tot, ch, qt]]) => ({ dd, nom: nom(dd), communes: tot, cherche: ch, quantifie: qt, partCherche: tot ? ch / tot : null, partQuantifie: tot ? qt / tot : null }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd))
}

// --- Plomb et canalisations -----------------------------------------------------------------------------------------

/** Paramètres de la page « Plomb et canalisations », écartés du jugement des réseaux (CANALISATIONS). */
export const PARAMS_CANALISATIONS = [
  { code: '1382', nom: 'Plomb' },
  { code: '1392', nom: 'Cuivre' },
  { code: '1386', nom: 'Nickel' },
] as const

export interface CompteAnalyses {
  /** analyses */
  n: number
  /** résultats au-dessus de la limite de qualité */
  nd: number
}

/** Analyses et résultats au-dessus de la limite, par année, d'après la série mensuelle nationale d'un paramètre. */
export function analysesParAnnee(serie: SeriesFile | null | undefined): Map<string, CompteAnalyses> {
  const m = new Map<string, CompteAnalyses>()
  if (!serie) return m
  serie.mois.forEach((mois, i) => {
    const a = mois.slice(0, 4)
    const c = m.get(a) ?? { n: 0, nd: 0 }
    c.n += serie.national.n[i] ?? 0
    c.nd += serie.national.nd[i] ?? 0
    m.set(a, c)
  })
  return m
}

export interface LigneAnalyses extends CompteAnalyses {
  dd: string
  nom: string
  /** part des analyses au-dessus de la limite (0–1) ; null sans analyse */
  part: number | null
  /** au moins EFFECTIF_MIN analyses (règle des classements pour un paramètre) */
  classable: boolean
}

/** Analyses d'un paramètre par département pour une année (série mensuelle), une ligne par département analysé. */
export function analysesParDept(serie: SeriesFile | null | undefined, annee: string | number, nom: (dd: string) => string): LigneAnalyses[] {
  if (!serie) return []
  const idx = serie.mois.map((m, i) => (m.startsWith(`${annee}-`) ? i : -1)).filter((i) => i >= 0)
  const lignes: LigneAnalyses[] = []
  for (const [sise, d] of Object.entries(serie.depts)) {
    const n = idx.reduce((a, i) => a + (d.n[i] ?? 0), 0)
    if (!n) continue
    const nd = idx.reduce((a, i) => a + (d.nd[i] ?? 0), 0)
    const dd = deptCode(sise)
    lignes.push({ dd, nom: nom(dd), n, nd, part: nd / n, classable: classable(n) })
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.dd.localeCompare(b.dd))
}

// --- TFA ------------------------------------------------------------------------------------------------------------

/** Code SISE du TFA (acide trifluoroacétique), groupe « tfa » de horsgrille.json. */
export const CODE_TFA = '8858'

export interface AnneeTfa {
  annee: string
  analyses: number
  quantifiees: number
  reseaux: number
  reseauxQuantifie: number
  communes: number
  communesQuantifie: number
  /** communes du fichier cette année-là (dénominateur de l'étendue de la recherche) */
  communesTotal: number | null
  max: number | null
}

/** Recherche et quantification du TFA, année par année (horsgrille.json) ; années sans analyse comprises, à zéro. */
export function anneesTfa(hg: HorsGrilleFile | null | undefined): AnneeTfa[] {
  if (!hg) return []
  const s = hg.substances[CODE_TFA]
  return hg.annees.map((annee) => {
    const a = s?.annees[annee]
    return {
      annee,
      analyses: a?.n ?? 0,
      quantifiees: a?.nq ?? 0,
      reseaux: a?.res ?? 0,
      reseauxQuantifie: a?.res_q ?? 0,
      communes: a?.com ?? 0,
      communesQuantifie: a?.com_q ?? 0,
      communesTotal: hg.par_groupe.tfa?.[annee]?.com_tot ?? null,
      max: a?.vmax ?? null,
    }
  })
}

/** Départements où le TFA a été recherché une année : [nom, code, communes où recherché, communes où quantifié], par ordre alphabétique. */
export function deptsTfa(hg: HorsGrilleFile | null | undefined, annee: string | number, nom: (dd: string) => string): { dd: string; nom: string; cherche: number; quantifie: number }[] {
  const d = hg?.depts.tfa?.[String(annee)] ?? {}
  return Object.entries(d)
    .filter(([, [, ch]]) => ch > 0)
    .map(([dd, [, ch, qt]]) => ({ dd, nom: nom(dd), cherche: ch, quantifie: qt }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
}

/** Phrase de l'étendue de la recherche du TFA une année : « En 2025, le TFA a été recherché dans 3 communes sur 34 817 ». */
export function phraseRechercheTfa(a: AnneeTfa): string {
  if (!a.analyses) return `En ${a.annee}, aucune analyse du TFA n’est publiée.`
  const sur = a.communesTotal ? ` sur ${fmt.int(a.communesTotal)}` : ''
  return `En ${a.annee}, le TFA a été recherché sur ${fmt.nb(a.reseaux, 'réseau', 'réseaux')} desservant ${fmt.nb(a.communes, 'commune')}${sur} ; il a été quantifié dans ${fmt.nb(a.quantifiees, 'analyse')} sur ${fmt.int(a.analyses)}.`
}

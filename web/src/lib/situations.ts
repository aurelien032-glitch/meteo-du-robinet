import { niveauxScale, type Scale } from './scale'
import { couleursEtats } from './theme'

/**
 * Situations des réseaux de distribution, famille par famille, selon la méthode de chaque bilan officiel
 * (décision de l'auteur et recherche du 2026-09-22 ; calcul : pipeline/robinet/situations.py) :
 *  · pesticides — bilan national du ministère : C, NC0 (≤ 30 jours), NC1 (> 30 jours), NC2 (restriction) ;
 *  · nitrates — bilan national : classe de la concentration MAXIMALE de l'année (25, 40, 50 mg/L) ;
 *  · bactériologie — bilans des ARS : taux de conformité des prélèvements, bonne qualité à 95 % ;
 *  · PFAS, métaux et minéraux — conformité à la limite (pas de bilan national par durée) ;
 *  · autres limites de qualité — tous les autres paramètres que l'arrêté du 11 janvier 2007 soumet à une limite
 *    (sous-produits de désinfection, chlorure de vinyle, solvants, HAP, turbidité…), conformité à la limite (choix de
 *    l'auteur, 2026-10-03 : l'indicateur global de l'ARS les retient tous).
 *
 * Unité : le RÉSEAU. Les bilans officiels pondèrent par la population desservie, non publiée en données
 * ouvertes : la plateforme compte des réseaux, sans estimer d'habitants — une commune n'est pas
 * « concernée » en entier parce qu'une analyse a dépassé la limite.
 */

/** Ordre des familles dans les codes de réseau et de commune (pipeline situations.FAMILLES). */
export const FAMILLES_SITU = ['pesticides', 'azote', 'pfas', 'microbio', 'metaux_mineraux', 'autres'] as const
export type FamilleSitu = (typeof FAMILLES_SITU)[number] | 'toutes'

/** Réseaux par classe de situation (quatre cases ; trois servent aux familles binaires). */
export type Repartition = [number, number, number, number]

export interface SituationsFile {
  familles: string[]
  /** code d'un réseau : un chiffre par famille, « - » si la famille n'y a pas été analysée */
  reseaux: Record<string, string>
  /**
   * classes A–D par famille (lettres dans l'ordre de `familles`, « - » non analysée) des réseaux qui ne sont pas en A
   * pour toutes ; un réseau absent est en A pour ses familles analysées (classeArs). Absent des fichiers antérieurs.
   */
  classes?: Record<string, string>
  /**
   * prélèvements bactériologiques cumulés (grille de l'ARS) des réseaux dont la bactériologie n'est pas en A :
   * [prélèvements, non conformes, maximum d'E. coli ou d'entérocoques en n/100 mL, première année prise en compte].
   * Absent des fichiers antérieurs au 05/10/2026.
   */
  bact?: Record<string, [number, number, number, number]>
  depts: Record<string, Partial<Record<FamilleSitu, Repartition>>>
  national: Partial<Record<FamilleSitu, Repartition>>
}

const BINAIRES: FamilleSitu[] = ['pfas', 'metaux_mineraux', 'autres', 'toutes']

/*
 * Seuils des bilans officiels, recopiés du pipeline (pipeline/robinet/situations.py : CLASSES_NITRATES,
 * SEUIL_BACT, SEUIL_JOURS) ; lib/seuils.test.ts vérifie qu'ils ne divergent pas. Les libellés ci-dessous et
 * les instruments des fiches (réglettes graduées) en sont dérivés : un seuil ne s'écrit qu'ici.
 */
/** Nitrates (mg/L) : la classe compte les seuils STRICTEMENT dépassés par le maximum de l'année ; 50,0 reste conforme. */
export const SEUILS_NITRATES = [25, 40, 50] as const
/** Bactériologie : part des prélèvements conformes à partir de laquelle la qualité est jugée bonne. */
export const SEUIL_BACT = 0.95
/** Pesticides : jours de dépassement cumulés au-delà desquels « 30 jours au plus » devient « plus de 30 jours ». */
export const SEUIL_JOURS_PESTICIDES = 30
/** PFAS : limite de qualité de la somme des 20 PFAS (µg/L), celle que donne aussi params.json pour 8847. */
export const LIMITE_PFAS_DEFAUT = 0.1
/**
 * Note A–D de la bactériologie : grille de l'indicateur global de l'ARS (publiée par l'ARS Provence-Alpes-Côte d'Azur ;
 * choix de l'auteur, 2026-10-05, après comparaison à 198 synthèses 2025). Lignes du plus grand effectif au plus petit :
 * [prélèvements au moins, taux de conformité (%) sous lequel D, taux à partir duquel A ; entre les deux, B]. Un maximum
 * d'E. coli ou d'entérocoques d'au moins MAX_GERMES n/100 mL donne C au mieux. Recopiée de situations.py (GRILLE_BACT).
 */
export const GRILLE_BACT = [
  [100, 95, 99],
  [50, 95, 98],
  [20, 95, 95],
  [0, 90, 90],
] as const
export const MAX_GERMES = 5
/** Prélèvements cumulés, années antérieures comprises (cinq ans au plus), sur lesquels porte la grille. */
export const ANALYSES_BACT_MIN = 10
/** PFAS : jours de dépassement dans l'année à partir desquels un dépassement compte dans la note (confirmation). */
export const JOURS_CONFIRMATION_PFAS = 2

/**
 * Hors du jugement d'un réseau, comme dans l'indicateur global de l'ARS (choix de l'auteur, 2026-10-03 ; recopiés de
 * pipeline/robinet/situations.py, vérifiés par lib/seuils.test.ts) ; publiés dans le détail des analyses :
 * paramètres liés aux canalisations, mesurés au robinet (plomb, nickel, cuivre).
 */
export const CANALISATIONS = ['1382', '1386', '1392'] as const
/**
 * Matériaux des canalisations publiques et réactifs de traitement (05/10) : chlorure de vinyle, HAP, benzo(a)pyrène,
 * acrylamide, épichlorhydrine.
 */
export const MATERIAUX = ['1753', '2033', '1115', '1457', '1494'] as const
/**
 * Nitrites : limite de qualité jugée avec les autres limites, la classe des nitrates ne lisant que le maximum des
 * nitrates (choix de l'auteur, 2026-10-05 ; recopié de NITRITES, pipeline/robinet/situations.py).
 */
export const NITRITES = '1339'

/**
 * Métabolites non pertinents, sans limite de qualité à partir de l'année de l'avis de l'Anses (recopié de
 * NON_PERTINENTS, pipeline/robinet/themes.py, vérifié par lib/seuils.test.ts) : chlorothalonil R471811 depuis 2024,
 * ESA-métolachlore et diméthénamide ESA depuis 2022, AMPA depuis 2025 (tableau de l'Anses de juillet 2025).
 */
export const NON_PERTINENTS: Readonly<Record<string, number>> = { '8865': 2024, '6854': 2022, '6865': 2022, '1907': 2025 }

/** Vrai si le paramètre a perdu sa limite de qualité cette année-là (métabolite non pertinent). */
export const sansLimite = (cdparametre: string, annee: string | number): boolean =>
  NON_PERTINENTS[cdparametre] != null && Number(annee) >= NON_PERTINENTS[cdparametre]

/** Remarque du détail des analyses sur un dépassement qui ne compte pas dans le jugement du réseau ; null sinon. */
export function horsJugement(cdparametre: string): string | null {
  if ((CANALISATIONS as readonly string[]).includes(cdparametre))
    return 'Lié aux canalisations intérieures : hors du jugement du réseau, comme dans les synthèses de l’ARS.'
  if ((MATERIAUX as readonly string[]).includes(cdparametre))
    return 'Lié aux matériaux des canalisations ou aux réactifs de traitement : hors du jugement du réseau, comme dans l’indicateur de l’ARS.'
  return null
}

/**
 * Millésimes partiels (meta.partiel) : l'année en cours, publiée mois par mois. Le site s'ouvre sur elle (choix de
 * l'auteur du 29/09) ; un bilan partiel ne peut pas dire « toute l'année » : ses libellés disent « depuis le
 * 1er janvier ». Déclarés par useYear (lib/year.ts) dès que meta.json est lu, et par scripts/prerendu-fiches.ts.
 */
const partiels = new Set<string>()
export function declarerPartiels(annees: readonly (string | number)[]): void {
  partiels.clear()
  for (const a of annees) partiels.add(String(a))
}
export const estPartiel = (annee?: string | number | null): boolean => annee != null && partiels.has(String(annee))

/**
 * Libellé d'une classe pour une année : celui de libellesSituation, sauf la classe « conforme » des pesticides d'un
 * millésime partiel, écrite « conforme depuis le 1er janvier ». Sans année, le libellé courant.
 */
export function libelleClasse(f: FamilleSitu, classe: number, annee?: string | number | null): string {
  if (f === 'pesticides' && classe === 0 && estPartiel(annee)) return 'conforme depuis le 1er janvier'
  return libellesSituation(f)[classe]
}

/** Classe nitrates d'un maximum annuel, comme le pipeline (`sum(v > s for s in CLASSES_NITRATES)`). */
export function classeNitrates(max: number): number {
  return SEUILS_NITRATES.filter((s) => max > s).length
}
/**
 * Classe bactériologique d'après les prélèvements conformes, comme le pipeline : 0 si tous le sont, 1 à partir
 * du seuil, 2 en dessous ; null si aucun n'a été évalué. La classe 3 (consigne ou restriction) vient des avis
 * de l'ARS, pas des comptes.
 */
export function classeBacterio(nonConformes: number, evalues: number): number | null {
  if (!evalues) return null
  if (nonConformes === 0) return 0
  return (evalues - nonConformes) / evalues >= SEUIL_BACT ? 1 : 2
}

const [N1, N2, N3] = SEUILS_NITRATES
/**
 * Part de prélèvements non conformes tolérée par la bonne qualité bactériologique (5 %). Les classes se lisent en
 * non-conformes (choix de l'auteur, 24/09) : « au moins 95 % de prélèvements conformes » se lisait, en réserve,
 * comme une bonne nouvelle.
 */
const PCT_NC_BACT = 100 - Math.round(SEUIL_BACT * 100)
const J = SEUIL_JOURS_PESTICIDES

/** Libellés des classes de situation d'une famille, du plus favorable au plus défavorable. */
export function libellesSituation(f: FamilleSitu): string[] {
  switch (f) {
    case 'pesticides':
      return ['conforme toute l’année', `dépassements ${J} jours au plus`, `dépassements plus de ${J} jours`, 'restriction de consommation']
    case 'azote':
      return [`maximum sous ${N1} mg/L`, `maximum de ${N1} à ${N2} mg/L`, `maximum de ${N2} à ${N3} mg/L`, `au-dessus de ${N3} mg/L au moins une fois`]
    case 'microbio':
      return [
        'tous les prélèvements conformes',
        `quelques prélèvements non conformes, ${PCT_NC_BACT} % au plus`,
        `plus de ${PCT_NC_BACT} % de prélèvements non conformes`,
        "consigne d'ébullition ou restriction",
      ]
    case 'toutes':
      return ['conforme pour toutes les familles', 'non conforme pour au moins une famille', 'restriction ou consigne']
    default:
      return ['conforme', 'au moins un dépassement constaté', 'restriction de consommation']
  }
}

/** Libellés courts, pour les colonnes étroites des tableaux. */
export function libellesCourts(f: FamilleSitu): string[] {
  switch (f) {
    case 'pesticides':
      return ['conforme', `${J} jours au plus`, `plus de ${J} jours`, 'restriction']
    case 'azote':
      return [`< ${N1} mg/L`, `${N1} à ${N2} mg/L`, `${N2} à ${N3} mg/L`, `> ${N3} mg/L`]
    case 'microbio':
      return ['100 % conformes', `≤ ${PCT_NC_BACT} % non conformes`, `> ${PCT_NC_BACT} % non conformes`, 'consigne']
    case 'toutes':
      return ['conforme', 'non conforme', 'restriction']
    default:
      return ['conforme', 'dépassement', 'restriction']
  }
}

/** Nombre de classes d'une famille (quatre, ou trois pour les familles binaires). */
export const nbClasses = (f: FamilleSitu) => (BINAIRES.includes(f) ? 3 : 4)

/**
 * Classes qui valent non-conformité au sens du bilan officiel de la famille (pipeline situations.non_conforme). Les
 * limites de la directive 2020/2184 (PFAS, chlorates, chlorites, acides haloacétiques, bisphénol A, uranium…)
 * s'appliquent depuis le 1er janvier 2023 (note DGS/EA4/2023/61 du 14 avril 2023) : un dépassement y est une
 * non-conformité dès 2023, première année des données du site (choix de l'auteur, 2026-10-04).
 */
export function classesNonConformes(f: FamilleSitu): number[] {
  if (f === 'azote') return [3]
  if (f === 'microbio') return [2, 3]
  return BINAIRES.includes(f) ? [1, 2] : [1, 2, 3]
}

/** Ton du sémaphore : conforme, non conforme, restriction ou consigne (forme et couleur du voyant). */
export type Ton = 'good' | 'warn' | 'bad'

/**
 * Ton du sémaphore pour une classe de situation (étude UX du 23/09) : conforme — classes « avec réserve »
 * comprises, comme dans le verdict —, non conforme, ou restriction et consigne (dernière classe de chaque
 * famille ; les nitrates n'en ont pas). Seule source des couleurs de jugement : verdict, jauge, tableau de
 * situation, cartes communales (`couleursSituation`). Jamais le rang d'une classe : la classe 1 est non conforme
 * pour les pesticides, conforme pour les nitrates.
 */
export function toneSituation(f: FamilleSitu, classe: number): Ton {
  if (!classesNonConformes(f).includes(classe)) return 'good'
  return f !== 'azote' && classe === nbClasses(f) - 1 ? 'bad' : 'warn'
}

/**
 * Colonne de détail des tableaux : la situation la plus grave, ou la plus proche de la limite pour les
 * nitrates (dont la seule classe non conforme est déjà la première colonne).
 */
export function detailSituation(f: FamilleSitu): { titre: string; classes: number[] } {
  switch (f) {
    case 'pesticides':
      return { titre: `Plus de ${J} jours ou restriction`, classes: [2, 3] }
    case 'azote':
      return { titre: `Entre ${N2} et ${N3} mg/L`, classes: [2] }
    case 'microbio':
      return { titre: 'Consigne ou restriction', classes: [3] }
    default:
      return { titre: 'Restriction', classes: [2] }
  }
}

/**
 * Couleurs des classes sur les cartes communales (règle « juger et alerter en couleur », auteur, 24/09) : le ton de
 * chaque classe (`toneSituation`), dans la palette de « Lire un bulletin » ; une commune y prend la classe du réseau
 * le plus défavorable qui la dessert, celui que son bulletin montre d'office.
 */
export function couleursSituation(f: FamilleSitu): string[] {
  return couleursEtats(Array.from({ length: nbClasses(f) }, (_, k) => toneSituation(f, k)))
}
/**
 * Légende d'une carte de situation : une case par couleur réellement peinte (choix de l'auteur, 27/09). Les réserves
 * (nitrates de 25 à 50 mg/L, bactériologie à 5 % au plus de prélèvements non conformes) ont la couleur de « conforme » ; la
 * légende annonçait trois classes que la carte ne distingue pas. Elles y sont fusionnées : « conforme, réserves
 * comprises ». Libellés de l'année (libelleClasse : millésime partiel).
 */
export function legendeSituation(f: FamilleSitu, annee?: string | number | null): { couleur: string; libelle: string }[] {
  const cases: { couleur: string; libelle: string }[] = []
  couleursSituation(f).forEach((couleur, i) => {
    const precedente = cases[cases.length - 1]
    if (precedente?.couleur === couleur) precedente.libelle = 'conforme, réserves comprises'
    else cases.push({ couleur, libelle: libelleClasse(f, i, annee) })
  })
  return cases
}

/** Échelle ordinale d'une famille, pour les cartes communales et les légendes. */
export function situationScale(f: FamilleSitu): Scale {
  return niveauxScale(() => couleursSituation(f))
}

const somme = (r: Repartition, classes: number[]) => classes.reduce((a, i) => a + (r[i] ?? 0), 0)
const total = (r: Repartition) => r[0] + r[1] + r[2] + r[3]

/** Nombre de réseaux non conformes d'une répartition, au sens du bilan officiel de la famille. */
export function nonConformes(r: Repartition, f: FamilleSitu): number {
  return somme(r, classesNonConformes(f))
}
/** Réseaux des classes de détail (voir detailSituation). */
export function detail(r: Repartition, f: FamilleSitu): number {
  return somme(r, detailSituation(f).classes)
}
/** Réseaux analysés. */
export const reseauxAnalyses = total

/** Part des réseaux non conformes ; null sans réseau analysé. */
export function partNonConformes(r: Repartition | undefined, f: FamilleSitu): number | null {
  if (!r) return null
  const t = total(r)
  return t ? nonConformes(r, f) / t : null
}

/**
 * Classe `v` d'une famille qui vaut restriction de consommation ou consigne de l'ARS (pipeline
 * situations.restriction) : la dernière classe de chaque famille, en bactériologie la consigne d'ébullition ou la
 * restriction ; jamais pour les nitrates, dont les classes sont des concentrations, pas des décisions.
 */
export function enRestriction(fam: (typeof FAMILLES_SITU)[number], v: number): boolean {
  return fam !== 'azote' && v === nbClasses(fam) - 1 && (fam !== 'microbio' || v === 3)
}

/**
 * Classe (0…) d'une famille dans un code de réseau ou de commune ; « toutes » = 2 si une restriction ou
 * consigne, 1 si une famille est non conforme (classesNonConformes), 0 sinon.
 */
export function codeFamille(code: string | undefined | null, f: FamilleSitu): number | null {
  if (!code) return null
  if (f === 'toutes') {
    let pire = -1
    FAMILLES_SITU.forEach((fam, i) => {
      const c = code[i]
      if (c == null || c === '-') return
      const v = Number(c)
      pire = Math.max(pire, enRestriction(fam, v) ? 2 : classesNonConformes(fam).includes(v) ? 1 : 0)
    })
    return pire < 0 ? null : pire
  }
  const c = code[FAMILLES_SITU.indexOf(f)]
  return c == null || c === '-' ? null : Number(c)
}

type Famille = (typeof FAMILLES_SITU)[number]

/** Noms des familles dans une phrase (« pesticides, dépassements plus de 30 jours »), comme dans Verdict.tsx. */
export const NOMS_FAMILLES: Record<Famille, string> = {
  pesticides: 'pesticides',
  azote: 'nitrates',
  pfas: 'PFAS',
  microbio: 'bactériologie',
  metaux_mineraux: 'métaux et minéraux',
  autres: 'autres limites de qualité',
}

export interface Synthese {
  /** 0 conforme · 1 non conforme · 2 restriction ou consigne ; null si aucune famille analysée */
  global: number | null
  /** classe la plus défavorable de chaque famille analysée */
  pire: Partial<Record<Famille, number>>
  analysees: Famille[]
  /** familles non conformes au sens du bilan officiel de chacune */
  ennuis: Famille[]
  /**
   * familles conformes mais hors de leur classe la plus favorable : nitrates de 25 à 50 mg/L, bactériologie à 95 % ou
   * plus
   */
  reserves: Famille[]
}

/**
 * Situation la plus défavorable d'un ou de plusieurs réseaux, famille par famille : mêmes règles que le
 * verdict en tête des fiches (lib/bulletin.ts), pour qu'un tableau de réseaux ne le contredise pas.
 */
export function synthese(codes: readonly (string | null | undefined)[]): Synthese {
  const valides = codes.filter((c): c is string => !!c)
  const pire: Synthese['pire'] = {}
  for (const f of FAMILLES_SITU) {
    const v = valides.map((c) => codeFamille(c, f)).filter((x): x is number => x != null)
    if (v.length) pire[f] = Math.max(...v)
  }
  const g = valides.map((c) => codeFamille(c, 'toutes')).filter((x): x is number => x != null)
  const analysees = FAMILLES_SITU.filter((f) => pire[f] != null)
  return {
    global: g.length ? Math.max(...g) : null,
    pire,
    analysees,
    ennuis: analysees.filter((f) => classesNonConformes(f).includes(pire[f]!)),
    reserves: analysees.filter((f) => pire[f]! > 0 && !classesNonConformes(f).includes(pire[f]!)),
  }
}

/**
 * Situation d'UN réseau en une ligne de tableau : ton du sémaphore (toneSituation), statut, et détail —
 * familles en cause s'il est non conforme ; sinon réserves (jamais « conforme toute l'année » quand une
 * classe intermédiaire existe, cf. CLAUDE.md) et nombre de familles analysées quand il en manque.
 */
export function situationReseau(
  code: string | null | undefined,
  annee?: string | number,
): { classe: number | null; ton: 'good' | 'warn' | 'bad' | null; statut: string; detail: string } {
  const s = synthese([code])
  if (s.global == null) return { classe: null, ton: null, statut: 'non analysé', detail: '' }
  const libelle = (f: Famille) => `${NOMS_FAMILLES[f]}, ${libelleClasse(f, s.pire[f]!, annee)}`
  const detail =
    s.global > 0
      ? s.ennuis.map(libelle).join(' ; ')
      : [
          s.reserves.length ? `avec ${s.reserves.length > 1 ? 'des réserves' : 'une réserve'} : ${s.reserves.map(libelle).join(' ; ')}` : '',
          s.analysees.length < FAMILLES_SITU.length ? `${s.analysees.length} ${s.analysees.length > 1 ? 'familles analysées' : 'famille analysée'} sur ${FAMILLES_SITU.length}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
  return { classe: s.global, ton: toneSituation('toutes', s.global), statut: ['conforme', 'non conforme', 'restriction ou consigne'][s.global], detail }
}

/** Famille des situations correspondant à la famille d'un thème (la radioactivité n'a pas de limite de qualité). */
export function familleDuTheme(famille: string): FamilleSitu | null {
  return (FAMILLES_SITU as readonly string[]).includes(famille) ? (famille as FamilleSitu) : null
}

/*
 * Classe A–D d'un réseau : « indicateur global de qualité » des synthèses annuelles de l'ARS jointes à la facture
 * (infofactures, depuis 2023 ; choix de l'auteur, 2026-10-03). Calcul : pipeline/robinet/situations.py (lettre) ;
 * A conforme, réserves comprises ; B dépassements cumulés sur 30 jours au plus ; C plus de 30 jours, ou eau
 * déconseillée aux publics sensibles ; D restriction ou consigne. Bactériologie : grille de l'ARS (GRILLE_BACT, 05/10) ;
 * PFAS : un dépassement ne compte qu'une fois répété dans l'année (JOURS_CONFIRMATION_PFAS). La classe du réseau est sa
 * famille la plus défavorable (note DGS/EA4 du 19 juillet 2019). Une lettre en minuscule est reprise d'une année
 * antérieure (famille non analysée dans l'année, cinq ans au plus). Calculée : la fiche de l'ARS fait foi.
 */
export type LettreArs = 'A' | 'B' | 'C' | 'D'

/** Libellés des quatre classes, ceux des fiches de l'ARS. */
export const CLASSES_ARS: Record<LettreArs, string> = {
  A: 'Eau de bonne qualité',
  B: 'Eau de qualité convenable ayant fait l’objet de non-conformités limitées',
  C: 'Eau de qualité insuffisante ayant pu faire l’objet de limitation de consommation',
  D: 'Eau de mauvaise qualité ayant pu faire l’objet d’interdiction de consommation',
}

/** Ton de chaque classe, dans la palette de « Lire un bulletin » : un réseau, donc un jugement. */
export const TON_ARS: Record<LettreArs, Ton> = { A: 'good', B: 'warn', C: 'warn', D: 'bad' }

/**
 * Classe A–D d'un réseau pour l'année du fichier, et lettre de chaque famille ; null sans famille analysée ou sans
 * classes dans le fichier (fichiers antérieurs au 03/10/2026).
 */
export function classeArs(
  situ: SituationsFile | null | undefined,
  cdreseau: string,
): { classe: LettreArs; familles: Partial<Record<Famille, LettreArs>>; reportees: Famille[]; bact: BactCumul | null } | null {
  const code = situ?.reseaux[cdreseau]
  if (!situ?.classes || !code) return null
  const lettres = situ.classes[cdreseau] ?? code.replace(/[^-]/g, 'A')
  const familles: Partial<Record<Famille, LettreArs>> = {}
  // Une lettre en minuscule vient d'une année antérieure (famille non analysée dans l'année, pipeline `reporter`).
  const reportees: Famille[] = []
  FAMILLES_SITU.forEach((f, i) => {
    const l = lettres[i]?.toUpperCase()
    if (l === 'A' || l === 'B' || l === 'C' || l === 'D') {
      familles[f] = l
      if (lettres[i] !== l) reportees.push(f)
    }
  })
  const presentes = Object.values(familles)
  if (!presentes.length) return null
  const b = situ.bact?.[cdreseau]
  const bact = b ? { n: b[0], nc: b[1], max: b[2], debut: b[3] } : null
  return { classe: presentes.reduce((a, b) => (b > a ? b : a)), familles, reportees, bact }
}

/** Prélèvements bactériologiques sur lesquels porte la note (grille de l'ARS), années antérieures comprises. */
export interface BactCumul {
  n: number
  nc: number
  /** maximum d'E. coli ou d'entérocoques, n/100 mL */
  max: number
  /** première année prise en compte */
  debut: number
}

/** Ligne de la grille bactériologique qui s'applique à `n` prélèvements : [au moins, seuil de D, seuil de A]. */
export const ligneGrilleBact = (n: number) => GRILLE_BACT.find((g) => n >= g[0]) ?? GRILLE_BACT[GRILLE_BACT.length - 1]

import { niveauxScale, type Scale } from './scale'
import { couleursEtats } from './theme'

/**
 * Situations des réseaux de distribution, famille par famille, selon la méthode de chaque bilan officiel
 * (décision de l'auteur et recherche du 2026-09-22 ; calcul : pipeline/robinet/situations.py) :
 *  · pesticides — bilan national du ministère : C, NC0 (≤ 30 jours), NC1 (> 30 jours), NC2 (restriction) ;
 *  · nitrates — bilan national : classe de la concentration MAXIMALE de l'année (25, 40, 50 mg/L) ;
 *  · bactériologie — bilans des ARS : taux de conformité des prélèvements, bonne qualité à 95 % ;
 *  · PFAS, métaux et minéraux — conformité à la limite (pas de bilan national par durée).
 *
 * Unité : le RÉSEAU. Les bilans officiels pondèrent par la population desservie, non publiée en données
 * ouvertes : la plateforme compte des réseaux, sans estimer d'habitants — une commune n'est pas
 * « concernée » en entier parce qu'une analyse a dépassé la limite.
 */

/** Ordre des familles dans les codes de réseau et de commune (pipeline situations.FAMILLES). */
export const FAMILLES_SITU = ['pesticides', 'azote', 'pfas', 'microbio', 'metaux_mineraux'] as const
export type FamilleSitu = (typeof FAMILLES_SITU)[number] | 'toutes'

/** Réseaux par classe de situation (quatre cases ; trois servent aux familles binaires). */
export type Repartition = [number, number, number, number]

export interface SituationsFile {
  familles: string[]
  /** code d'un réseau : un chiffre par famille, « - » si la famille n'y a pas été analysée */
  reseaux: Record<string, string>
  depts: Record<string, Partial<Record<FamilleSitu, Repartition>>>
  national: Partial<Record<FamilleSitu, Repartition>>
}

const BINAIRES: FamilleSitu[] = ['pfas', 'metaux_mineraux', 'toutes']

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
const PCT_BACT = Math.round(SEUIL_BACT * 100)
const J = SEUIL_JOURS_PESTICIDES

/** Libellés des classes de situation d'une famille, du plus favorable au plus défavorable. */
export function libellesSituation(f: FamilleSitu): string[] {
  switch (f) {
    case 'pesticides':
      return ['conforme toute l’année', `dépassements ${J} jours au plus`, `dépassements plus de ${J} jours`, 'restriction de consommation']
    case 'azote':
      return [`maximum sous ${N1} mg/L`, `maximum de ${N1} à ${N2} mg/L`, `maximum de ${N2} à ${N3} mg/L`, `au-dessus de ${N3} mg/L au moins une fois`]
    case 'microbio':
      return ['tous les prélèvements conformes', `au moins ${PCT_BACT} % de prélèvements conformes`, `moins de ${PCT_BACT} % de prélèvements conformes`, "consigne d'ébullition ou restriction"]
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
      return ['100 % conformes', `≥ ${PCT_BACT} %`, `< ${PCT_BACT} %`, 'consigne']
    case 'toutes':
      return ['conforme', 'non conforme', 'restriction']
    default:
      return ['conforme', 'dépassement', 'restriction']
  }
}

/** Nombre de classes d'une famille (quatre, ou trois pour les familles binaires). */
export const nbClasses = (f: FamilleSitu) => (BINAIRES.includes(f) ? 3 : 4)

/** Classes qui valent non-conformité au sens du bilan officiel de la famille. */
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
 * Classe (0…) d'une famille dans un code de réseau ou de commune ; « toutes » = 2 si une restriction ou
 * consigne, 1 si une famille est non conforme, 0 sinon.
 */
export function codeFamille(code: string | undefined | null, f: FamilleSitu): number | null {
  if (!code) return null
  if (f === 'toutes') {
    let pire = -1
    FAMILLES_SITU.forEach((fam, i) => {
      const c = code[i]
      if (c == null || c === '-') return
      const v = Number(c)
      const restr = fam !== 'azote' && v === nbClasses(fam) - 1 && (fam !== 'microbio' || v === 3)
      pire = Math.max(pire, restr ? 2 : classesNonConformes(fam).includes(v) ? 1 : 0)
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
}

export interface Synthese {
  /** 0 conforme · 1 non conforme · 2 restriction ou consigne ; null si aucune famille analysée */
  global: number | null
  /** classe la plus défavorable de chaque famille analysée */
  pire: Partial<Record<Famille, number>>
  analysees: Famille[]
  /** familles non conformes au sens du bilan officiel de chacune */
  ennuis: Famille[]
  /** familles conformes mais hors de leur classe la plus favorable : nitrates de 25 à 50 mg/L, bactériologie à 95 % ou plus */
  reserves: Famille[]
}

/**
 * Situation la plus défavorable d'un ou de plusieurs réseaux, famille par famille : mêmes règles que le
 * verdict en tête des fiches (components/Verdict.tsx), pour qu'un tableau de réseaux ne le contredise pas.
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
export function situationReseau(code: string | null | undefined): { classe: number | null; ton: 'good' | 'warn' | 'bad' | null; statut: string; detail: string } {
  const s = synthese([code])
  if (s.global == null) return { classe: null, ton: null, statut: 'non analysé', detail: '' }
  const libelle = (f: Famille) => `${NOMS_FAMILLES[f]}, ${libellesSituation(f)[s.pire[f]!]}`
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

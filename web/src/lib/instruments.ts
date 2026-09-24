import { fmt } from './data'
import { parseSeuil } from './hubeau'
import {
  classeBacterio,
  classeNitrates,
  codeFamille,
  FAMILLES_SITU,
  libellesCourts,
  libellesSituation,
  LIMITE_PFAS_DEFAUT,
  SEUIL_BACT,
  SEUIL_JOURS_PESTICIDES,
  SEUILS_NITRATES,
  toneSituation,
  type Ton,
} from './situations'
import type { CommuneYearStats, ParamInfo } from './types'

/**
 * Instruments du bulletin d'un réseau (maquette « vigilance + instruments » du 23/09) : une échelle par famille,
 * graduée aux seuils des bilans officiels. Nitrates, bactériologie et PFAS ont une valeur mesurée, placée sur une
 * réglette ; les pesticides (durée des dépassements, non exportée) et les métaux (plusieurs paramètres, chacun sa
 * limite) se lisent en paliers. Le jugement reste celui du code de situation (lib/situations.ts) : la valeur
 * l'illustre, elle ne le refait pas.
 */

export type FamilleReseau = (typeof FAMILLES_SITU)[number]

const NITRATES = '1340'
const SOMME_PFAS = '8847'
export const NBSP = '\u00a0'
export const NON_ANALYSEE = 'non analysée'

const [N1, N2, N3] = SEUILS_NITRATES

/** Titre, méthode et règle de lecture de chaque famille, pour le bulletin et sa légende (components/LireBulletin.tsx). */
export const TEXTES_FAMILLES: Record<FamilleReseau, { titre: string; methode: string; lecture: string }> = {
  pesticides: {
    titre: 'Pesticides et métabolites',
    methode: 'Durée des dépassements dans l’année, selon le bilan national.',
    lecture: `Conforme, dépassements de ${SEUIL_JOURS_PESTICIDES}${NBSP}jours cumulés au plus, de plus de ${SEUIL_JOURS_PESTICIDES}${NBSP}jours, ou restriction de consommation.`,
  },
  azote: {
    titre: 'Nitrates',
    methode: 'Classe de la concentration maximale de l’année.',
    lecture: `Moins de ${N1}, de ${N1} à ${N2}, de ${N2} à ${N3}${NBSP}mg/L : conforme. Au-delà de ${N3}${NBSP}mg/L, limite de qualité dépassée.`,
  },
  pfas: {
    titre: 'PFAS',
    methode: 'Conformité à la limite de qualité.',
    lecture: `Somme de 20 PFAS comparée à la limite de qualité de ${fmt.sig(LIMITE_PFAS_DEFAUT)}${NBSP}µg/L.`,
  },
  microbio: {
    titre: 'Bactériologie',
    methode: 'Part des prélèvements conformes dans l’année.',
    lecture: `Les bilans des ARS jugent la qualité bonne quand au moins ${Math.round(SEUIL_BACT * 100)}${NBSP}% des prélèvements sont conformes.`,
  },
  metaux_mineraux: {
    titre: 'Métaux et minéraux',
    methode: 'Conformité aux limites de qualité.',
    lecture: 'Chaque paramètre est comparé à sa limite de qualité (plomb, arsenic, fluorures…).',
  },
}

/** Réglette graduée : échelle, repères officiels, plage hors limite, et la valeur du réseau placée dessus. */
export interface Reglette {
  forme: 'reglette'
  min: number
  max: number
  unite: string
  /** graduations officielles, la limite comprise */
  reperes: number[]
  limite: number
  /** plage hors limite : au-dessus pour les nitrates et les PFAS, au-dessous pour la bactériologie */
  horsLimite: [number, number]
  /** étiquettes de l'échelle, extrémités comprises (sans unité : elle suit la lecture) */
  graduations: { v: number; t: string }[]
  /** valeur placée sur l'échelle ; null si non mesurée ou écartée par la garde (valeurCoherente) */
  valeur: number | null
  /** lecture écrite près du repère (« 45,9 mg/L ») ; null sans repère */
  lecture: string | null
}

/** Échelle par classes, dans l'ordre du bilan ; chaque palier porte le ton de sa classe. */
export interface Paliers {
  forme: 'paliers'
  classes: { t: string; ton: Ton }[]
  actif: number | null
}

/** Paramètre au-dessus de sa limite de qualité dans l'année (ligne `dep` des statistiques). */
export interface ParamEnCause {
  code: string
  libelle: string
  analyses: number
  depassements: number
  max: number | null
  unite: string | null
  limite: string | null
}

export interface Instrument {
  famille: FamilleReseau
  /** classe du code de situation ; null : famille non analysée sur ce réseau cette année */
  classe: number | null
  ton: Ton | null
  libelle: string
  echelle: Reglette | Paliers
  /** paramètres de la famille au-dessus de leur limite, du plus au moins souvent */
  enCause: ParamEnCause[]
  /** bactériologie : prélèvements non conformes et évalués */
  prelevements?: { nonConformes: number; evalues: number }
}

/** Valeurs d'un réseau pour une année, lues dans ses statistiques (`reseaux[r].stats[année]`). */
export interface ValeursReseau {
  /** nitrates : concentration maximale de l'année (mg/L), celle qui fait la classe */
  nitratesMax: number | null
  /** PFAS : maximum de la somme des 20 PFAS (µg/L) */
  pfasMax: number | null
  limitePfas: number
  bacterio: { nonConformes: number; evalues: number } | null
  enCause: Partial<Record<FamilleReseau, ParamEnCause[]>>
}

const estFamilleReseau = (f: string): f is FamilleReseau => (FAMILLES_SITU as readonly string[]).includes(f)

export function valeursReseau(stats: CommuneYearStats | undefined, params: Record<string, ParamInfo>): ValeursReseau {
  const enCause: ValeursReseau['enCause'] = {}
  for (const [code, analyses, depassements, , , max] of stats?.dep ?? []) {
    const info = params[code]
    if (!info || !estFamilleReseau(info.f)) continue
    ;(enCause[info.f] ??= []).push({ code, libelle: info.l, analyses, depassements, max, unite: info.u, limite: info.lim })
  }
  const [, nc, ne] = stats?.plv ?? []
  const lim = parseSeuil(params[SOMME_PFAS]?.lim).max
  return {
    nitratesMax: stats?.cle[NITRATES]?.[4] ?? null,
    pfasMax: stats?.cle[SOMME_PFAS]?.[4] ?? null,
    limitePfas: lim && lim > 0 ? lim : LIMITE_PFAS_DEFAUT,
    bacterio: ne ? { nonConformes: nc ?? 0, evalues: ne } : null,
    enCause,
  }
}

/**
 * Garde de cohérence : la valeur ne porte le repère que si elle mène à la classe du code de situation. La part
 * décidée par l'ARS reste hors de ce calcul : une restriction PFAS suppose un dépassement mesuré, une consigne
 * d'ébullition peut suivre un seul prélèvement non conforme, quel que soit le taux. Sinon (maximum d'un autre
 * paramètre, fichiers d'un autre calcul), pas de repère : le bulletin nomme le paramètre en cause.
 */
export function valeurCoherente(f: FamilleReseau, classe: number | null, v: ValeursReseau): boolean {
  if (classe == null) return false
  switch (f) {
    case 'azote':
      return v.nitratesMax != null && classeNitrates(v.nitratesMax) === classe
    case 'pfas':
      return v.pfasMax != null && (v.pfasMax > v.limitePfas) === (classe >= 1)
    case 'microbio':
      return v.bacterio != null && (classe === 3 || classeBacterio(v.bacterio.nonConformes, v.bacterio.evalues) === classe)
    default:
      return false
  }
}

/** Arrondi vers le haut sur 1, 1,5, 2, 3, 5, 6 ou 10 × 10^k (x > 0) : borne d'échelle lisible. */
export function niceCeil(x: number): number {
  const p = 10 ** Math.floor(Math.log10(x))
  const k = [1, 1.5, 2, 3, 5, 6, 10].find((c) => x / p <= c + 1e-9) ?? 10
  return Number((k * p).toPrecision(6))
}

/**
 * Écrit une valeur mesurée sans contredire sa classe : tant que l'arrondi la fait passer de l'autre côté d'un
 * seuil (50,04 mg/L écrit « 50,0 », qui serait conforme), on ajoute un chiffre. La relecture porte sur la chaîne
 * écrite, pour juger exactement ce que le lecteur verra. Seuils stricts par défaut (limite dépassée au-delà de
 * 50) ; `inclusif` pour des classes qui s'ouvrent à leur borne (part de 10 % et plus, lib/carte.ts).
 */
export function sansFranchir(v: number, seuils: readonly number[], ecrire: (precision: number) => string, precision: number, inclusif = false): string {
  const lu = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'))
  const au = (x: number, s: number) => (inclusif ? x >= s : x > s)
  for (let p = precision; p < precision + 4; p++) {
    const t = ecrire(p)
    if (seuils.every((s) => au(lu(t), s) === au(v, s))) return t
  }
  return ecrire(precision + 4)
}

/**
 * Part des prélèvements conformes, tronquée au dixième : un échec sur 2 000 se lit « 99,9 % », jamais « 100 % ».
 * Tronquer ne franchit ni 95 ni 100, multiples du dixième.
 */
export function lectureTaux(nonConformes: number, evalues: number): string {
  if (nonConformes === 0) return `100${NBSP}%`
  return `${fmt.dec(Math.floor((1000 * (evalues - nonConformes)) / evalues) / 10, 1)}${NBSP}%`
}

function regletteNitrates(max: number | null): Reglette {
  const limite = SEUILS_NITRATES[SEUILS_NITRATES.length - 1]
  const fin = Math.max(60, max != null ? Math.ceil((max * 1.1) / 10) * 10 : 0)
  return {
    forme: 'reglette',
    min: 0,
    max: fin,
    unite: 'mg/L',
    reperes: [...SEUILS_NITRATES],
    limite,
    horsLimite: [limite, fin],
    graduations: [0, ...SEUILS_NITRATES, fin].map((x) => ({ v: x, t: fmt.int(x) })),
    valeur: max,
    lecture: max == null ? null : `${sansFranchir(max, SEUILS_NITRATES, (p) => fmt.dec(max, p), 1)}${NBSP}mg/L`,
  }
}

function reglettePfas(max: number | null, limite: number): Reglette {
  const fin = niceCeil(Math.max(limite * 1.5, max != null ? max * 1.2 : 0))
  return {
    forme: 'reglette',
    min: 0,
    max: fin,
    unite: 'µg/L',
    reperes: [limite],
    limite,
    horsLimite: [limite, fin],
    graduations: [0, limite, fin].map((x) => ({ v: x, t: fmt.sig(x) })),
    valeur: max,
    lecture: max == null ? null : `${sansFranchir(max, [limite], (p) => fmt.sig(max, p), 3)}${NBSP}µg/L`,
  }
}

function regletteBacterio(b: ValeursReseau['bacterio']): Reglette {
  const limite = Math.round(SEUIL_BACT * 100)
  const taux = b ? (100 * (b.evalues - b.nonConformes)) / b.evalues : null
  const debut = taux != null ? Math.min(90, Math.floor(taux / 5) * 5) : 90
  return {
    forme: 'reglette',
    min: debut,
    max: 100,
    unite: '%',
    reperes: [limite],
    limite,
    horsLimite: [debut, limite],
    graduations: [debut, limite, 100].map((x) => ({ v: x, t: `${fmt.int(x)}${NBSP}%` })),
    valeur: taux,
    lecture: b ? lectureTaux(b.nonConformes, b.evalues) : null,
  }
}

function paliers(f: FamilleReseau, classe: number | null): Paliers {
  return {
    forme: 'paliers',
    classes: libellesCourts(f).map((t, i) => ({ t: t[0].toUpperCase() + t.slice(1), ton: toneSituation(f, i) })),
    actif: classe,
  }
}

/** Instrument d'une famille : classe et ton du code de situation, valeur placée si la garde l'admet. */
export function instrument(f: FamilleReseau, classe: number | null, v: ValeursReseau): Instrument {
  const garde = valeurCoherente(f, classe, v)
  const commun = {
    famille: f,
    classe,
    ton: classe == null ? null : toneSituation(f, classe),
    libelle: classe == null ? NON_ANALYSEE : libellesSituation(f)[classe],
    enCause: v.enCause[f] ?? [],
  }
  switch (f) {
    case 'azote':
      return { ...commun, echelle: regletteNitrates(garde ? v.nitratesMax : null) }
    case 'pfas':
      return { ...commun, echelle: reglettePfas(garde ? v.pfasMax : null, v.limitePfas) }
    case 'microbio':
      return { ...commun, echelle: regletteBacterio(garde ? v.bacterio : null), prelevements: v.bacterio ?? undefined }
    default:
      return { ...commun, echelle: paliers(f, classe) }
  }
}

/** Les cinq instruments d'un réseau pour une année, dans l'ordre des bilans. */
export function instrumentsReseau(stats: CommuneYearStats | undefined, code: string | null | undefined, params: Record<string, ParamInfo>): Instrument[] {
  const v = valeursReseau(stats, params)
  return FAMILLES_SITU.map((f) => instrument(f, codeFamille(code, f), v))
}

/**
 * Ligne « en cause » sous un instrument (maquette du 23/09). Famille jugée non conforme : le paramètre le plus
 * souvent au-dessus de sa limite (`gras`), puis ce qu'il en reste au détail. Bactériologie : les prélèvements non
 * conformes dès qu'il y en a, et la décision de l'ARS en cas de consigne. Les nitrates n'en ont pas : leur réglette
 * porte déjà la valeur qui fait la classe. null quand il n'y a rien à dire.
 */
export function causeInstrument(i: Instrument): { gras: string | null; texte: string } | null {
  if (i.classe == null) return null
  if (i.famille === 'microbio') {
    const ars = i.ton === 'bad' ? 'Consigne ou restriction décidée par l’ARS.' : ''
    const p = i.prelevements
    if (!p?.nonConformes) return ars ? { gras: null, texte: ars } : null
    const compte = `${fmt.nb(p.nonConformes, 'prélèvement non conforme', 'prélèvements non conformes')} sur ${fmt.int(p.evalues)}.`
    return { gras: null, texte: ars ? `${compte} ${ars}` : compte }
  }
  if (i.famille === 'azote' || i.ton === 'good' || !i.enCause.length) return null
  const [p, ...autres] = i.enCause
  const max = p.max != null ? `, au plus ${fmt.sig(p.max)}${p.unite ? `${NBSP}${p.unite}` : ''}` : ''
  const reste = autres.length ? ` ${fmt.nb(autres.length, 'autre paramètre', 'autres paramètres')} au détail.` : ''
  return { gras: p.libelle, texte: `${fmt.nb(p.depassements, 'analyse')} sur ${fmt.int(p.analyses)} au-dessus de la limite${max}.${reste}` }
}

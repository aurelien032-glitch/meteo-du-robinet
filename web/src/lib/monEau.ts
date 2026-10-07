/**
 * Fiche « Mon eau » (refonte complète demandée par l'auteur le 2026-10-05, « non tu revois tout ») : la carte d'identité
 * de l'eau d'un réseau, écrite pour un habitant. Une note A–D et une phrase en français courant, l'avis de l'ARS s'il y en
 * a un, puis une case par question d'habitant, en trois groupes (GroupeCase : la note, le quotidien, à savoir aussi).
 * Règles : aucun terme réglementaire dans le texte principal (les textes officiels sont cités dans la source de chaque
 * case) ; aucune réponse ni conseil sanitaire du site ; les avis de l'ARS sont rapportés au passé, datés, attribués.
 */
import { dernierPrelevement, type AvisMoment } from './enCeMoment'
import { fmt, majuscule } from './data'
import { libelleParametre } from './parametres'
import { estPartiel, horsJugement, FAMILLES_SITU, NON_PERTINENTS, sansLimite, type LettreArs } from './situations'
import type { CommuneYearStats, ParamInfo } from './types'

export type EtatCase = 'bon' | 'alerte' | 'grave' | 'neutre' | 'absent'

/**
 * Groupes de cases (choix de l'auteur, 2026-10-05, « il faut des indicateurs qui intéressent l'usager ») : ce qui fait
 * la note ; l'eau au quotidien (aspect, dureté, chlore, pH, fluor) ; à savoir aussi (contrôles, substances sans limite,
 * prix). Le plomb n'a pas de case : il dépend des canalisations de chaque bâtiment, que le contrôle ne mesure pas.
 */
export type GroupeCase = 'note' | 'quotidien' | 'aussi'
export const TITRES_GROUPES: Record<GroupeCase, string> = {
  note: 'Paramètres pris en compte dans la note',
  quotidien: 'Aspect, goût et minéralisation',
  aussi: 'Contrôles, substances sans limite et prix',
}

export type CleCase = 'bact' | 'pest' | 'nitr' | 'pfas' | 'autres' | 'aspect' | 'calc' | 'chlo' | 'ph' | 'fluor' | 'controles' | 'sanslimite' | 'prix'
const GROUPE: Record<CleCase, GroupeCase> = {
  bact: 'note',
  pest: 'note',
  nitr: 'note',
  pfas: 'note',
  autres: 'note',
  aspect: 'quotidien',
  calc: 'quotidien',
  chlo: 'quotidien',
  ph: 'quotidien',
  fluor: 'quotidien',
  controles: 'aussi',
  sanslimite: 'aussi',
  prix: 'aussi',
}

export interface CaseEau {
  cle: CleCase
  groupe?: GroupeCase
  titre: string
  etat: EtatCase
  /** réponse en deux à quatre mots */
  reponse: string
  /** précision chiffrée, une ligne */
  precision: string
  /** explication, phrases courtes */
  explication: string[]
  source: string
  /** page qui explique le sujet (thème, service d'eau) */
  lien?: { to: string; texte: string }
}

/** Pages des sujets, ouvertes depuis l'explication d'une case. */
const LIENS: Partial<Record<CaseEau['cle'], { to: string; texte: string }>> = {
  bact: { to: '/themes/bacteries', texte: 'Les bactéries dans l’eau du robinet' },
  pest: { to: '/themes/pesticides', texte: 'Les pesticides dans l’eau du robinet' },
  nitr: { to: '/themes/nitrates', texte: 'Les nitrates dans l’eau du robinet' },
  pfas: { to: '/themes/pfas', texte: 'Les PFAS dans l’eau du robinet' },
  autres: { to: '/themes/metaux', texte: 'Les métaux et minéraux' },
  fluor: { to: '/themes/metaux', texte: 'Les métaux et minéraux' },
  sanslimite: { to: '/hors-grille', texte: 'Les substances sans limite de qualité' },
}

/** Prix de l'eau d'une fiche : le service de la commune, ou plusieurs services quand un réseau en dessert plusieurs. */
export type PrixEau = { prix: number | null; annee: string; id?: string | null } | 'plusieurs' | null

/** Noms de familles en mots courants, pour les phrases. */
export const MOTS_FAMILLES: Record<(typeof FAMILLES_SITU)[number], string> = {
  pesticides: 'pesticides',
  azote: 'nitrates',
  pfas: 'PFAS',
  microbio: 'bactéries',
  metaux_mineraux: 'métaux',
  autres: 'autres substances',
}

/** Titres de la note, ceux de l'indicateur de l'ARS. */
export const TITRES_NOTE: Record<LettreArs, string> = {
  A: 'Bonne qualité',
  B: 'Qualité convenable',
  C: 'Qualité insuffisante',
  D: 'Mauvaise qualité',
}

const ARRETE = 'Arrêté du 11 janvier 2007 modifié.'

/** Valeurs d'un paramètre dans les statistiques d'une année : analyses, dépassements, maximum, moyenne. */
export function valeur(s: CommuneYearStats | undefined, code: string): { n: number; nd: number; nr: number; max: number | null; moy: number | null } | null {
  const dep = s?.dep.find((r) => r[0] === code)
  if (dep) return { n: dep[1], nd: dep[2], nr: dep[3], max: dep[5], moy: dep[6] }
  const c = s?.cle[code]
  if (c) return { n: c[0], nd: c[1], nr: c[2], max: c[4], moy: c[5] }
  return null
}

/** Métabolites non pertinents de l'année (sansLimite) : libellés, pour l'explication des pesticides. */
function nonPertinents(annee: string, params: Record<string, ParamInfo>): string[] {
  return Object.keys(NON_PERTINENTS)
    .filter((c) => sansLimite(c, annee))
    .map((c) => libelleParametre(c, params[c]?.l))
}

/** Classe d'une famille dans un code de situation (« 230000 »), null si elle n'est pas analysée. */
export function classeFamille(code: string | null | undefined, f: (typeof FAMILLES_SITU)[number]): number | null {
  const ch = code?.[FAMILLES_SITU.indexOf(f)]
  return ch == null || ch === '-' ? null : Number(ch)
}

const pluriel = (n: number, un: string, plusieurs: string) => `${fmt.int(n)} ${n > 1 ? plusieurs : un}`

/**
 * Période d'un bilan : « en 2025 », ou « depuis le 1er janvier 2026 » pour l'année en cours (estPartiel) ; un bilan partiel
 * ne dit jamais « en 2026 » sans réserve. `courte` sert aux réponses des cases (« Pas mesurés depuis le 1er janvier »).
 */
export function periodes(annee: string): { periode: string; Periode: string; courte: string } {
  const partiel = estPartiel(annee)
  const periode = partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`
  return { periode, Periode: periode[0].toUpperCase() + periode.slice(1), courte: partiel ? 'depuis le 1er janvier' : periode }
}

/**
 * Catégories de dureté des synthèses annuelles de l'ARS (infofactures 2025 : les 189 synthèses de l'échantillon qui la
 * catégorisent emploient les mêmes bornes, dans toutes les régions ; douce jusqu'à 9,3 °f, peu calcaire de 10,5 à 19,8,
 * dure de 20,2 à 29,9, très dure à partir de 30,1). Borne haute exclue, sur la valeur affichée (une décimale).
 */
export const CATEGORIES_DURETE: readonly (readonly [number, string])[] = [
  [10, 'Eau douce'],
  [20, 'Eau peu calcaire'],
  [30, 'Eau dure'],
]
/**
 * Catégories de l'équilibre calcocarbonique (paramètre 5907, classe de 0 à 4 ; référence de qualité de 1 à 2, eau
 * légèrement incrustante ou à l'équilibre, arrêté du 11 janvier 2007) d'après la classe moyenne arrondie, comme les
 * synthèses de l'ARS du Grand Est et d'Auvergne (2025 : moyenne 4 « Eau agressive », 2,6 « Eau légèrement agressive »).
 */
export const CATEGORIES_CALCO = ['Eau incrustante', 'Eau légèrement incrustante', 'Eau à l’équilibre', 'Eau légèrement agressive', 'Eau agressive'] as const
export const categorieCalco = (classe: number): string => CATEGORIES_CALCO[Math.min(4, Math.max(0, Math.round(classe)))]

export const categorieDurete = (th: number): string => {
  const v = Math.round(th * 10) / 10
  return CATEGORIES_DURETE.find(([max]) => v < max)?.[1] ?? 'Eau très dure'
}

/** Cases de « l'eau au quotidien » qui reprennent, faute de mesure dans l'année, la dernière mesure du réseau. */
const CASES_REPRISES: readonly CleCase[] = ['aspect', 'calc', 'chlo', 'ph', 'fluor']
/** Années remontées au plus pour une mesure reprise. */
const ANNEES_REPRISE = 5

/**
 * Les cases de la carte d'identité d'un réseau pour une année. `historique` (statistiques du même réseau, par année) :
 * une case de l'eau au quotidien sans mesure dans l'année reprend la dernière mesure des cinq années précédentes,
 * datée et sans jugement (auteur, 2026-10-06 : la dureté de Saint-Quentin, mesurée trente fois en 2025, n'avait encore
 * aucune mesure publiée en 2026, et la case disait « Pas mesuré »).
 */
export function casesEau(o: {
  situation: string | null | undefined
  stats: CommuneYearStats | undefined
  params: Record<string, ParamInfo>
  annee: string
  prix: PrixEau
  historique?: Record<string, CommuneYearStats | undefined>
}): CaseEau[] {
  const { situation, stats, annee } = o
  const { Periode, courte } = periodes(annee)
  const cases: CaseEau[] = []

  // Bactéries : prélèvements évalués et non conformes (DIS_PLV), classe du bilan des ARS.
  const cb = classeFamille(situation, 'microbio')
  const ne = stats?.plv[2] ?? 0
  const nc = stats?.plv[1] ?? 0
  const bactLignes = ['Bactéries témoins d’une contamination fécale (Escherichia coli, entérocoques intestinaux).', 'La limite de qualité est de zéro bactérie dans 100 mL.']
  cases.push(
    cb == null || ne === 0
      ? { cle: 'bact', titre: 'Bactéries', etat: 'absent', reponse: `Pas contrôlées ${courte}`, precision: '', explication: bactLignes, source: ARRETE }
      : cb === 3
        ? { cle: 'bact', titre: 'Bactéries', etat: 'grave', reponse: 'Avis de l’ARS', precision: `trouvées ${pluriel(nc, 'fois', 'fois')} sur ${fmt.int(ne)} contrôles`, explication: [...bactLignes, `${Periode}, des bactéries ont été trouvées ${pluriel(nc, 'fois', 'fois')} sur ${fmt.int(ne)} contrôles, et l’ARS a émis un avis.`], source: ARRETE }
        : nc === 0
          ? { cle: 'bact', titre: 'Bactéries', etat: 'bon', reponse: 'Aucune trouvée', precision: `${fmt.int(ne)} contrôles`, explication: [...bactLignes, `${Periode}, aucun des ${fmt.int(ne)} contrôles n’en a trouvé.`], source: ARRETE }
          : { cle: 'bact', titre: 'Bactéries', etat: cb >= 2 ? 'alerte' : 'bon', reponse: cb >= 2 ? `Trouvées ${pluriel(nc, 'fois', 'fois')}` : 'Rarement trouvées', precision: `sur ${fmt.int(ne)} contrôles`, explication: [...bactLignes, `${Periode}, des bactéries ont été trouvées ${pluriel(nc, 'fois', 'fois')} sur ${fmt.int(ne)} contrôles.`], source: ARRETE },
  )

  // Pesticides : classe du bilan national (durée cumulée des dépassements) ; maximum du total quand il est mesuré.
  const cp = classeFamille(situation, 'pesticides')
  const total = valeur(stats, '6276')
  const pestLignes = [
    'Substances actives des produits phytosanitaires (herbicides, insecticides, fongicides) et leurs métabolites.',
    'La limite de qualité est de 0,1 µg/L par substance et de 0,5 µg/L pour leur total.',
  ]
  // Total déclaré au-dessus de 0,5 µg/L alors que la famille est sous la limite : le laboratoire y comptait un métabolite
  // non pertinent, que la note retire (pipeline, themes.resultats_juges ; 2024 surtout).
  const np = nonPertinents(annee, o.params)
  const totalAvecNp = np.length > 0 && cp === 0 && total?.max != null && total.max > 0.5
  const auPlusPest =
    total?.max == null
      ? ''
      : totalAvecNp
        ? `Le total déclaré par le laboratoire a atteint ${fmt.sig(total.max)} µg/L, car il comprenait un résidu non pertinent ; sans lui, il reste sous 0,5 µg/L.`
        : `Au plus haut, le total a atteint ${fmt.sig(total.max)} µg/L (microgrammes par litre).`
  // Métabolites non pertinents (avis de l'Anses) : sans limite de qualité, hors de la note, comme dans l'indicateur de l'ARS.
  if (np.length)
    pestLignes.push(
      `L’Anses a classé non ${np.length > 1 ? 'pertinents les résidus' : 'pertinent le résidu'} ${np.join(', ')} : ${np.length > 1 ? 'ils n’ont' : 'il n’a'} plus la limite de 0,1 µg/L, mais une valeur indicative de 0,9 µg/L, et ne ${np.length > 1 ? 'comptent' : 'compte'} pas dans la note.`,
    )
  if (cp == null) cases.push({ cle: 'pest', titre: 'Pesticides', etat: 'absent', reponse: `Pas recherchés ${courte}`, precision: '', explication: pestLignes, source: ARRETE })
  else
    cases.push({
      cle: 'pest',
      titre: 'Pesticides',
      etat: cp === 0 ? 'bon' : cp === 3 ? 'grave' : 'alerte',
      reponse: ['Sous la limite', 'Limite dépassée peu de temps', 'Limite dépassée plus d’un mois', 'Avis de l’ARS'][cp],
      precision: cp === 1 ? '30 jours au plus' : total?.max != null && !totalAvecNp ? `total au plus ${fmt.sig(total.max)} µg/L` : '',
      explication: [...pestLignes, cp === 0 ? `${Periode}, aucun résultat n’a dépassé la limite.` : `${Periode}, des résultats ont dépassé la limite ${cp === 1 ? 'pendant 30 jours au plus' : 'pendant plus d’un mois'}.`, auPlusPest].filter(Boolean),
      source: ARRETE,
    })

  // Nitrates : concentration maximale de l'année (bilan national) ; dépassements comptés.
  const cn = classeFamille(situation, 'azote')
  const nit = valeur(stats, '1340')
  const nitLignes = ['La limite de qualité des nitrates est de 50 mg/L.']
  if (cn == null || !nit) cases.push({ cle: 'nitr', titre: 'Nitrates', etat: 'absent', reponse: `Pas mesurés ${courte}`, precision: '', explication: nitLignes, source: ARRETE })
  else {
    const max = nit.max != null ? `${fmt.dec(nit.max, 1)} mg/L` : null
    cases.push(
      cn === 3
        ? { cle: 'nitr', titre: 'Nitrates', etat: 'alerte', reponse: `Limite dépassée ${pluriel(nit.nd, 'fois', 'fois')}`, precision: `sur ${fmt.int(nit.n)} contrôles`, explication: [...nitLignes, `${Periode}, la limite a été dépassée ${pluriel(nit.nd, 'fois', 'fois')} sur ${fmt.int(nit.n)} contrôles.`, max ? `Au plus haut : ${max}.` : ''].filter(Boolean), source: ARRETE }
        : { cle: 'nitr', titre: 'Nitrates', etat: 'bon', reponse: 'Sous la limite', precision: max ? `au plus ${max}` : '', explication: [...nitLignes, `${Periode}, la limite n’a pas été dépassée${max ? ` ; au plus haut : ${max}` : ''}.`], source: ARRETE },
    )
  }

  // PFAS : somme de 20 PFAS (8847), limite applicable depuis 2023.
  const cf = classeFamille(situation, 'pfas')
  const pf = valeur(stats, '8847')
  const pfLignes = ['Substances per- et polyfluoroalkylées, très persistantes dans l’environnement.', 'La limite de qualité est de 0,1 µg/L pour la somme de 20 PFAS.']
  if (cf == null) cases.push({ cle: 'pfas', titre: 'PFAS', etat: 'absent', reponse: `Pas recherchés ${courte}`, precision: 'recherche obligatoire depuis 2026', explication: pfLignes, source: `${ARRETE} Note de la direction générale de la santé du 14 avril 2023.` })
  else
    cases.push({
      cle: 'pfas',
      titre: 'PFAS',
      etat: cf === 0 ? 'bon' : cf === 2 ? 'grave' : 'alerte',
      reponse: ['Sous la limite', 'Au-dessus de la limite', 'Avis de l’ARS'][cf],
      precision: pf?.max != null ? `au plus ${fmt.sig(pf.max)} µg/L` : '',
      explication: [...pfLignes, cf === 0 ? `${Periode}, la limite n’a pas été dépassée.` : `${Periode}, la limite a été dépassée.`],
      source: `${ARRETE} Note de la direction générale de la santé du 14 avril 2023.`,
    })

  // Autres limites (métaux, autres substances) : une case seulement si l'une d'elles est en cause.
  const cm = classeFamille(situation, 'metaux_mineraux') ?? 0
  const ca = classeFamille(situation, 'autres') ?? 0
  if (cm > 0 || ca > 0) {
    const noms = (stats?.dep ?? [])
      .filter(([p]) => !horsJugement(p) && ['metaux_mineraux', 'organiques', 'physico_chimie'].includes(o.params[p]?.f ?? ''))
      .map(([p]) => o.params[p]?.l)
      .filter((l): l is string => !!l)
      .slice(0, 3)
    cases.push({
      cle: 'autres',
      titre: 'Autres substances',
      etat: cm === 2 || ca === 2 ? 'grave' : 'alerte',
      reponse: 'Limite dépassée',
      precision: noms.join(', '),
      explication: [`${Periode}, d’autres substances ont dépassé leur limite${noms.length ? ` : ${noms.join(', ')}` : ''}.`, 'Le détail des analyses donne chaque résultat.'],
      source: ARRETE,
    })
  }

  // Aspect : turbidité (limite de 1 NFU, référence de 2 NFU au robinet) et couleur (référence de 15 mg/L de platine).
  // Un écart à une référence de qualité n'est pas un dépassement de limite : la case reste neutre et le dit.
  const turb = valeur(stats, '1295')
  const coul = valeur(stats, '1309')
  const aspectLignes = [
    'La turbidité mesure le trouble de l’eau, la couleur sa coloration.',
    'Au robinet, les références de qualité sont de 2 NFU pour la turbidité et de 15 mg/L (platine-cobalt) pour la couleur.',
  ]
  if (!turb && !coul) cases.push({ cle: 'aspect', titre: 'Eau trouble ou colorée', etat: 'absent', reponse: `Pas mesuré ${courte}`, precision: '', explication: aspectLignes, source: ARRETE })
  else {
    const trouble = (turb?.nr ?? 0) + (turb?.nd ?? 0) > 0
    const colore = (coul?.nr ?? 0) > 0
    const ecarts = [trouble && `trouble ${pluriel(Math.max(turb!.nr, turb!.nd), 'fois', 'fois')}`, colore && `colorée ${pluriel(coul!.nr, 'fois', 'fois')}`].filter(Boolean) as string[]
    cases.push({
      cle: 'aspect',
      titre: 'Eau trouble ou colorée',
      etat: (turb?.nd ?? 0) > 0 ? 'alerte' : 'neutre',
      reponse: ecarts.length ? `${ecarts.join(', ').charAt(0).toUpperCase()}${ecarts.join(', ').slice(1)}` : 'Claire, sans couleur',
      precision: turb?.max != null ? `turbidité au plus ${fmt.sig(turb.max)} NFU` : coul?.n ? `${pluriel(coul.n, 'mesure', 'mesures')} de couleur` : '',
      explication: [
        ...aspectLignes,
        ecarts.length
          ? `${Periode}, l’eau a été mesurée ${ecarts.join(' et ')} au-delà de la référence${(turb?.nd ?? 0) > 0 ? ` ; la limite de 1 NFU a été dépassée ${pluriel(turb!.nd, 'fois', 'fois')}` : ''}.`
          : `${Periode}, les mesures sont restées dans les références.`,
      ],
      source: ARRETE,
    })
  }

  // Dureté et chlore : sans limite de qualité, présentés sans jugement. Les titres nomment la mesure (auteur, 2026-10-06 :
  // « Calcaire » et « Goût de chlore » nommaient un effet et une impression, que le contrôle ne mesure pas). La dureté
  // reçoit la catégorie des synthèses annuelles de l'ARS (`categorieDurete`) ; le chlore et le fluor, les informations
  // que ces synthèses donnent à l'habitant, citées et attribuées (auteur, 2026-10-06).
  const th = valeur(stats, '1345')
  const dureteLignes = [
    'La dureté, ou titre hydrotimétrique, mesure la teneur en calcium et en magnésium ; elle s’exprime en degrés français (°f).',
    'Une eau dure dépose du calcaire.',
    'Les synthèses annuelles de l’ARS disent l’eau douce sous 10 °f, peu calcaire de 10 à 20 °f, dure de 20 à 30 °f et très dure à partir de 30 °f.',
  ]
  cases.push(
    th?.moy != null
      ? { cle: 'calc', titre: 'Dureté', etat: 'neutre', reponse: categorieDurete(th.moy), precision: `${fmt.dec(th.moy, 1)} °f en moyenne`, explication: [...dureteLignes, 'Elle n’a ni limite ni référence de qualité.'], source: 'Contrôles de l’ARS, dureté de l’eau ; catégories des synthèses annuelles de l’ARS.' }
      : { cle: 'calc', titre: 'Dureté', etat: 'absent', reponse: `Pas mesurée ${courte}`, precision: '', explication: dureteLignes, source: 'Contrôles de l’ARS.' },
  )
  const cl = valeur(stats, '1398')
  const chloreLignes = [
    'Le chlore libre est le désinfectant qui reste dans l’eau après son traitement ; il en maintient la désinfection jusqu’au robinet.',
    'Il n’a pas de limite de qualité ; sa référence de qualité est l’absence d’odeur ou de saveur désagréable.',
    'Une teneur trop élevée peut donner un goût désagréable et favoriser la formation de sous-produits de désinfection.',
    'Plusieurs ARS indiquent dans leurs synthèses annuelles : « Pour éliminer le goût de chlore, mettez l’eau dans un récipient ouvert quelques heures au frigo, sans excéder 24 heures. »',
  ]
  cases.push(
    cl?.moy != null
      ? { cle: 'chlo', titre: 'Chlore', etat: 'neutre', reponse: `${fmt.dec(cl.moy, 2)} mg/L`, precision: cl.n > 1 ? 'en moyenne' : '1 mesure', explication: chloreLignes, source: 'Contrôles de l’ARS, chlore libre ; synthèses annuelles de l’ARS.' }
      : { cle: 'chlo', titre: 'Chlore', etat: 'absent', reponse: `Pas mesuré ${courte}`, precision: '', explication: chloreLignes, source: 'Contrôles de l’ARS.' },
  )

  // pH : référence de qualité de 6,5 à 9, sans limite ; neutre. L'équilibre calcocarbonique (5907, classe de 0 à 4) donne
  // la catégorie des synthèses de l'ARS (`categorieCalco`) : réponse de la case quand l'eau est agressive, précision sinon.
  const ph = valeur(stats, '1302')
  const calco = valeur(stats, '5907')
  const cat = calco?.moy != null ? categorieCalco(calco.moy) : null
  const agressive = calco?.moy != null && Math.round(calco.moy) >= 3
  const phLignes = [
    'Le pH mesure l’acidité de l’eau.',
    'Sa référence de qualité est comprise entre 6,5 et 9 ; une eau trop acide peut corroder les canalisations.',
    'L’équilibre calcocarbonique, noté de 0 (eau incrustante, qui dépose du calcaire) à 4 (eau agressive), a une référence de qualité comprise entre 1 et 2.',
    'Les synthèses annuelles de plusieurs ARS précisent qu’une eau agressive peut entraîner la corrosion de certaines canalisations, notamment en plomb, et des appareils ménagers.',
  ]
  const calcoPhrase = cat && calco ? `${Periode}, l’équilibre calcocarbonique a été noté en moyenne ${fmt.dec(calco.moy!, 1)} sur ${pluriel(calco.n, 'mesure', 'mesures')}, soit une ${cat.charAt(0).toLowerCase()}${cat.slice(1)}.` : null
  cases.push(
    ph?.moy != null
      ? {
          cle: 'ph',
          titre: 'pH',
          etat: 'neutre',
          reponse: agressive ? cat! : ph.nr > 0 ? `Hors de 6,5 à 9 ${pluriel(ph.nr, 'fois', 'fois')}` : `${fmt.dec(ph.moy, 1)} en moyenne`,
          precision: agressive
            ? `pH ${fmt.dec(ph.moy, 1)} en moyenne`
            : cat
              ? `${cat.charAt(0).toLowerCase()}${cat.slice(1)}`
              : ph.nr > 0
                ? `sur ${pluriel(ph.n, 'mesure', 'mesures')}`
                : 'entre 6,5 et 9',
          explication: [
            ...phLignes,
            ph.nr > 0 ? `${Periode}, ${pluriel(ph.nr, 'mesure est sortie', 'mesures sont sorties')} de la plage de 6,5 à 9, sur ${fmt.int(ph.n)}.` : `${Periode}, toutes les mesures du pH sont restées entre 6,5 et 9 ; moyenne ${fmt.dec(ph.moy, 1)}.`,
            ...(calcoPhrase ? [calcoPhrase] : []),
          ],
          source: cat ? `${ARRETE} Catégories des synthèses annuelles de l’ARS.` : ARRETE,
        }
      : { cle: 'ph', titre: 'pH', etat: 'absent', reponse: `Pas mesuré ${courte}`, precision: '', explication: phLignes, source: ARRETE },
  )

  // Fluor : limite de qualité de 1,5 mg/L ; mesuré moins souvent que les autres paramètres.
  const fl = valeur(stats, '7073')
  const flLignes = [
    'Les fluorures sont présents naturellement dans certaines eaux.',
    'La limite de qualité est de 1,5 mg/L.',
    'Les synthèses annuelles de l’ARS précisent : « Avant d’envisager un apport complémentaire en fluor, il convient de consulter un professionnel de santé. »',
  ]
  cases.push(
    !fl
      ? { cle: 'fluor', titre: 'Fluor', etat: 'absent', reponse: `Pas mesuré ${courte}`, precision: 'mesuré moins souvent', explication: [...flLignes, 'Le contrôle le mesure moins souvent que le reste.'], source: ARRETE }
      : fl.nd > 0
        ? { cle: 'fluor', titre: 'Fluor', etat: 'alerte', reponse: `Limite dépassée ${pluriel(fl.nd, 'fois', 'fois')}`, precision: fl.max != null ? `au plus ${fmt.sig(fl.max)} mg/L` : '', explication: [...flLignes, `${Periode}, la limite a été dépassée ${pluriel(fl.nd, 'fois', 'fois')} sur ${fmt.int(fl.n)} mesures.`], source: ARRETE }
        : { cle: 'fluor', titre: 'Fluor', etat: 'bon', reponse: 'Sous la limite', precision: fl.max != null ? `au plus ${fmt.sig(fl.max)} mg/L` : '', explication: [...flLignes, `${Periode}, la limite n’a pas été dépassée (${pluriel(fl.n, 'mesure', 'mesures')}).`], source: ARRETE },
  )

  // Contrôles : prélèvements de l'année et date du dernier.
  const nPlv = stats?.plv[0] ?? 0
  const dernier = dernierPrelevement(stats)
  const ctrlLignes = [
    'L’ARS fait prélever et analyser l’eau du réseau par un laboratoire agréé.',
    'La fréquence des contrôles dépend du débit distribué ; leur programme varie d’un prélèvement à l’autre.',
  ]
  cases.push(
    nPlv
      ? { cle: 'controles', titre: 'Contrôles de l’eau', etat: 'neutre', reponse: pluriel(nPlv, 'prélèvement', 'prélèvements'), precision: dernier ? `dernier le ${fmt.date(dernier)}` : '', explication: [...ctrlLignes, `${Periode}, ${pluriel(nPlv, 'prélèvement a été analysé', 'prélèvements ont été analysés')}${dernier ? ` ; le dernier date du ${fmt.date(dernier)}` : ''}.`], source: `${ARRETE} Annexe II, fréquence des contrôles.` }
      : { cle: 'controles', titre: 'Contrôles de l’eau', etat: 'absent', reponse: `Aucun ${courte}`, precision: '', explication: ctrlLignes, source: ARRETE },
  )

  // Substances sans limite de qualité (horsgrille) : trouvées ou non, sans jugement.
  const hg = stats?.hg
  const recherchees = hg ? Object.values(hg.g).reduce((t, g) => t + (g?.[0] ?? 0), 0) : 0
  const trouvees = (hg?.s ?? []).filter((x) => x[2] > 0)
  const shLignes = [
    'Substances recherchées qui n’ont ni limite ni référence de qualité, comme le TFA, le perchlorate, certains métabolites et les PFAS pris individuellement.',
    'Leur présence ne se compare à aucun seuil réglementaire.',
  ]
  const nomsTrouves = trouvees.slice(0, 2).map(([c]) => libelleParametre(c, o.params[c]?.l))
  cases.push(
    !recherchees
      ? { cle: 'sanslimite', titre: 'Substances sans limite', etat: 'absent', reponse: `Pas recherchées ${courte}`, precision: '', explication: shLignes, source: 'Contrôles de l’ARS ; liste du site.' }
      : {
          cle: 'sanslimite',
          titre: 'Substances sans limite',
          etat: 'neutre',
          reponse: trouvees.length ? `${pluriel(trouvees.length, 'trouvée', 'trouvées')}` : 'Aucune trouvée',
          precision: trouvees.length ? nomsTrouves.join(', ') : `${pluriel(recherchees, 'recherchée', 'recherchées')}`,
          explication: [...shLignes, `${Periode}, ${pluriel(recherchees, 'substance a été recherchée', 'substances ont été recherchées')} ; ${trouvees.length ? `${pluriel(trouvees.length, 'a été trouvée', 'ont été trouvées')}, dont ${nomsTrouves.join(' et ')}` : 'aucune n’a été trouvée'}.`],
          source: 'Contrôles de l’ARS ; liste du site (substances sans limite ni référence de qualité).',
        },
  )

  // Prix : déclaration SISPEA du service de la commune.
  const p = o.prix
  const SISPEA = 'Service d’eau de la commune, observatoire SISPEA.'
  cases.push(
    p === 'plusieurs'
      ? { cle: 'prix', titre: 'Prix', etat: 'neutre', reponse: 'Selon la commune', precision: 'plusieurs services d’eau', explication: ['Ce réseau dessert des communes de plusieurs services d’eau.', 'Le prix de chaque commune figure sur sa fiche.'], source: 'Observatoire SISPEA.' }
      : p?.prix != null
        ? { cle: 'prix', titre: 'Prix', etat: 'neutre', reponse: `${fmt.dec(p.prix, 2)} € le m³`, precision: `soit ${fmt.dec(p.prix / 10, 2)} centime le litre`, explication: [`Prix de ${fmt.dec(p.prix, 2)} € le mètre cube toutes taxes comprises, pour une consommation de 120 m³ par an, déclaré par le service d’eau pour ${p.annee}.`], source: SISPEA, ...(p.id ? { lien: { to: `/service/${p.id}`, texte: 'Le service d’eau de la commune' } } : {}) }
        : { cle: 'prix', titre: 'Prix', etat: 'absent', reponse: 'Non publié', precision: '', explication: ['Le service d’eau n’a pas publié son prix.'], source: 'Observatoire SISPEA.' },
  )

  const reprises = o.historique ? reprendreMesures(cases, o, periodes(annee).periode) : cases
  return reprises.map((c) => ({ ...c, groupe: GROUPE[c.cle], ...(LIENS[c.cle] && !c.lien ? { lien: LIENS[c.cle] } : {}) }))
}

/**
 * Case de l'eau au quotidien sans mesure dans l'année : la dernière mesure du même réseau, cinq ans au plus, avec son
 * année. Sans jugement (`neutre`) : un résultat d'une autre année ne dit rien de celle qu'on regarde.
 */
function reprendreMesures(cases: CaseEau[], o: Parameters<typeof casesEau>[0], periode: string): CaseEau[] {
  const an = Number(o.annee)
  return cases.map((c) => {
    if (c.etat !== 'absent' || !CASES_REPRISES.includes(c.cle)) return c
    for (let a = an - 1; a >= an - ANNEES_REPRISE; a--) {
      const stats = o.historique?.[String(a)]
      if (!stats) continue
      const avant = casesEau({ ...o, stats, annee: String(a), historique: undefined }).find((x) => x.cle === c.cle)
      if (!avant || avant.etat === 'absent') continue
      return {
        ...avant,
        etat: 'neutre' as const,
        precision: `${avant.precision ? `${avant.precision} ` : ''}en ${a}`,
        explication: [`Aucune mesure publiée ${periode} ; la valeur affichée est la dernière, de ${a}.`, ...avant.explication],
      }
    }
    return c
  })
}

/** Phrase de la note, en français courant. `familles` : lettres par famille (classeArs), `reportees` : reprises. */
export function phraseNote(o: {
  lettre: LettreArs | null
  familles: Partial<Record<(typeof FAMILLES_SITU)[number], LettreArs>>
  reportees: readonly string[]
  situation: string | null | undefined
  annee: string
}): string {
  const { lettre, annee } = o
  const { periode, Periode } = periodes(annee)
  if (!lettre) return `Pas de note : trop peu d’analyses ${periode}.`
  const mots = (fs: readonly string[]) => et(fs.map((f) => MOTS_FAMILLES[f as keyof typeof MOTS_FAMILLES] ?? f))
  // Familles reprises d'une année antérieure : dites par la reprise seule, jamais datées de l'année.
  const reprise = o.reportees.length ? ` Pour les ${mots(o.reportees)}, la note reprend les résultats des années précédentes.` : ''
  const codeBact = classeFamille(o.situation, 'microbio')
  // Une consigne liée aux bactéries reste dite, que la grille de l'ARS la retienne dans la note ou non.
  const consigne = codeBact === 3 ? ` L’ARS a émis une consigne liée aux bactéries ${periode}.` : ''
  if (lettre === 'A') {
    const reserves: string[] = []
    if (classeFamille(o.situation, 'azote') === 2) reserves.push('Les nitrates restent sous la limite, mais s’en approchent.')
    if (codeBact === 1) reserves.push('Des bactéries ont été détectées dans 5 % des prélèvements au plus.')
    if (codeBact === 2)
      reserves.push('Des bactéries ont été trouvées dans plus de 5 % des prélèvements, une proportion que la grille de l’ARS admet pour ce nombre de prélèvements.')
    if (classeFamille(o.situation, 'pfas') === 1) reserves.push('Un dépassement isolé de la limite des PFAS, non confirmé dans l’année, n’entre pas dans la note.')
    const nonRetenu = codeBact === 2 || codeBact === 3 || classeFamille(o.situation, 'pfas') === 1
    return [nonRetenu ? `Aucun dépassement retenu par la note ${periode}.` : `Aucune limite dépassée ${periode}.`, ...reserves].join(' ') + consigne + reprise
  }
  // Familles de la lettre mesurées dans l'année ; la bactériologie suit la grille de l'ARS (derniers prélèvements).
  const chimie = FAMILLES_SITU.filter((f) => f !== 'microbio' && o.familles[f] === lettre && !o.reportees.includes(f))
  const bact = o.familles.microbio === lettre && !o.reportees.includes('microbio')
  const parts: string[] = []
  if (chimie.length)
    parts.push(
      lettre === 'B'
        ? `${Periode}, une limite a été dépassée peu de temps : ${mots(chimie)}`
        : lettre === 'C'
          ? `${Periode}, des limites ont été dépassées : ${mots(chimie)}`
          : `${Periode}, l’ARS a restreint la consommation de l’eau : ${mots(chimie)}`,
    )
  if (bact) {
    const texte = BACT_NOTE[lettre]
    parts.push(parts.length ? texte : majuscule(texte))
  }
  const tete = parts.length ? `${parts.join(' ; ')}.` : ''
  return `${tete}${consigne}${reprise}`.trim()
}

/** La bactériologie dans la phrase de la note, selon la grille de l'ARS (derniers prélèvements, cinq ans au plus). */
const BACT_NOTE: Record<Exclude<LettreArs, 'A'>, string> = {
  B: 'des bactéries ont été trouvées dans quelques-uns des derniers prélèvements',
  C: 'des bactéries ont été trouvées en quantité notable dans les derniers prélèvements',
  D: 'des bactéries ont été trouvées dans une part élevée des derniers prélèvements',
}

/** « a, b et c ». */
const et = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}` : (xs[0] ?? ''))

export interface ResultatsSimples {
  /** familles au-dessus d'une limite, dans les mots des cases */
  lignes: Pick<CaseEau, 'cle' | 'titre' | 'etat' | 'reponse'>[]
  /** phrase quand aucune famille n'est en cause, ou sans contrôle publié */
  phrase: string | null
  prelevements: number
  dernier: string | null
}

/**
 * Derniers résultats de l'année en cours d'un réseau, dans les mots des cases (casesEau) : les familles au-dessus d'une
 * limite, sinon une phrase ; toujours « depuis le 1er janvier », jamais un bilan de l'année.
 */
export function resultatsSimples(o: { situation: string | null | undefined; stats: CommuneYearStats | undefined; params: Record<string, ParamInfo>; annee: string }): ResultatsSimples {
  if (!o.stats) return { lignes: [], phrase: `Aucun contrôle publié depuis le 1er janvier ${o.annee}.`, prelevements: 0, dernier: null }
  const lignes = casesEau({ ...o, prix: null })
    .filter((c) => ['bact', 'pest', 'nitr', 'pfas', 'autres'].includes(c.cle) && (c.etat === 'alerte' || c.etat === 'grave'))
    .map(({ cle, titre, etat, reponse }) => ({ cle, titre, etat, reponse }))
  return {
    lignes,
    phrase: lignes.length ? null : `Aucune limite dépassée depuis le 1er janvier ${o.annee}.`,
    prelevements: o.stats.plv[0],
    dernier: dernierPrelevement(o.stats),
  }
}

export interface AvisSimple {
  ton: 'alerte' | 'grave' | 'neutre'
  titre: string
  texte: string
  /** suite : date d'arrêt des données, rappel que la mairie sait si l'avis vaut toujours */
  suite: string
  citation: { texte: string; source: string } | null
  /** la mention en une phrase, public, cause et période, pour la carte « Qualité de l'eau » ; sinon le texte */
  ligne: string
  /**
   * période de la mention et réseaux concernés quand le lieu en compte plusieurs (« Mention relevée sur le réseau Haut
   * service, du … au … »), puis les autres catégories de l'année : jamais un avis sans son réseau (2026-10-05)
   */
  details: string[]
}

/** L'avis de l'ARS de l'année en cours, en mots simples, au passé et daté. */
export function avisSimple(a: AvisMoment, arret: string | undefined): AvisSimple {
  const jusquau = arret ? `Données arrêtées au ${fmt.date(arret)}.` : ''
  if (a.etat === 'avis') {
    const date = a.citation ? fmt.date(a.citation.date) : ''
    const texte =
      a.cat === 'ebullition'
        ? 'L’ARS a demandé de faire bouillir l’eau avant consommation.'
        : a.cat === 'interdiction'
          ? 'L’ARS a restreint la consommation de l’eau du robinet.'
          : 'L’ARS a déconseillé la consommation de l’eau à des publics sensibles.'
    return {
      ton: a.cat === 'sensibles' ? 'alerte' : 'grave',
      titre: date ? `Avis de l’ARS du ${date}` : 'Avis de l’ARS',
      texte,
      suite: `${jusquau} Pour toute consigne, la mairie et l’ARS font foi.`.trim(),
      citation: a.citation ? { texte: a.citation.texte, source: `Texte de l’ARS, contrôle du ${fmt.date(a.citation.date)}${a.citation.reseau ? `, ${a.citation.reseau}` : ''}.` } : null,
      ligne: a.ligne,
      details: [a.periode, ...a.autres],
    }
  }
  if (a.etat === 'sans-information')
    return {
      ton: 'neutre',
      titre: 'Avis de l’ARS',
      texte: 'L’ARS de ce département ne précise pas ses avis dans les résultats qu’elle publie.',
      ligne: 'L’ARS de ce département ne précise pas ses avis dans les résultats qu’elle publie.',
      suite: 'Pour toute consigne, la mairie et l’ARS font foi.',
      citation: null,
      details: [],
    }
  if (a.etat === 'aucun') return { ton: 'neutre', titre: 'Avis de l’ARS', texte: a.phrase, ligne: a.phrase, suite: jusquau, citation: null, details: [] }
  return { ton: 'neutre', titre: 'Avis de l’ARS', texte: a.phrase, ligne: a.phrase, suite: '', citation: null, details: [] }
}

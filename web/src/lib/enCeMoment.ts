import { dateLongue, periode, periodeLongue, phraseSansInformation, phraseSuite, publicsAvis, suiteAvis, toneAvisSuivi, type LigneAvis, type SuiteAvis } from './avis'
import { comptes, liste, phraseVerdict } from './bulletin'
import { fmt } from './data'
import { TEXTES_FAMILLES, type FamilleReseau } from './instruments'
import { codeFamille, libelleClasse, synthese, toneSituation, type Ton } from './situations'
import { AVIS_CODE, AVIS_LIBELLE, type AvisCat, type AvisDeptFile, type CommuneYearStats } from './types'

/**
 * Carte « En ce moment » des fiches commune et réseau (refonte, lot 1, choix de l'auteur du 2026-10-05) : ce que les
 * données de l'année en cours disent aujourd'hui, indépendamment de l'année du bilan. D'abord les avis de l'ARS, tels
 * qu'elle les a publiés : attribués, datés, cités, jamais reformulés en réponse sanitaire du site (prudence juridique) ;
 * une délégation « sans information » le dit (règle du 24/09, jamais « aucun avis ») ; une période, jamais un état
 * (règle du 25/09). Puis les derniers résultats, jugés par les fonctions du bulletin (synthese, libelleClasse).
 */

/** Mention de prudence de la carte (choix de l'auteur, 2026-10-05). */
export const MENTION_PRUDENCE =
  'Le site reprend les conclusions publiées par l’ARS et ne formule aucune recommandation sanitaire. Pour toute consigne en vigueur, la mairie et l’ARS font foi.'

type Textes = AvisDeptFile['textes']

/** Réseau de l'année en cours : code, nom lisible (lib/nomsReseaux), code de situation (situations/<année>.json). */
export interface ReseauMoment {
  code: string
  nom: string
  situation: string | null | undefined
}

export interface DonneesMoment {
  /** année en cours (meta.partiel) ; absente quand aucun millésime partiel n'est publié */
  annee: string | undefined
  /** date d'arrêt des données de l'année en cours (avis.arret) */
  arret?: string
  /** lignes d'avis de la commune, ou du réseau (avisDuReseau) */
  lignes: readonly LigneAvis[]
  textes: Textes
  /** derniers prélèvements conclus des réseaux porteurs d'un avis (avis.derniers de l'année en cours) */
  derniers?: Record<string, string>
  /** délégation de l'ARS sans information sur les consignes cette année (avis.sansInfoBulletin) */
  sansInfo: { conclusions: number; lieux: string } | null
  /** statistiques de l'année en cours ; absentes sans prélèvement */
  stats?: CommuneYearStats
  reseaux: readonly ReseauMoment[]
  /** « à Saint-Quentin », « sur ce réseau » */
  lieu: string
}

/** Citation de la dernière conclusion de l'ARS d'une catégorie. */
export interface Citation {
  texte: string
  date: string
  reseau: string | null
}

export type AvisMoment =
  | {
      etat: 'avis'
      cat: AvisCat
      ton: Exclude<Ton, 'good'> | null
      phrase: string
      /** période de la mention, réseaux concernés et suite au dernier prélèvement connu */
      periode: string
      /** la mention en une phrase, public visé, cause et période (carte « Qualité de l'eau » des fiches) */
      ligne: string
      /** autres catégories de l'année, moins graves */
      autres: string[]
      citation: Citation | null
    }
  | { etat: 'sans-information'; phrase: string; explication: string }
  | { etat: 'aucun'; phrase: string }
  | { etat: 'sans-donnees'; phrase: string; explication?: string }

export interface LigneResultat {
  famille: FamilleReseau
  ton: Ton
  texte: string
}

export type ResultatsMoment =
  | { etat: 'familles'; lignes: LigneResultat[]; prelevements: number; dernier: string | null }
  | { etat: 'sans-ecart'; phrase: string; dernier: string | null }
  | { etat: 'sans-donnees'; phrase: string }

/** « une eau déconseillée aux publics sensibles », « une consigne d'ébullition », « une restriction de consommation ». */
const mentionCat = (cat: AvisCat) => (cat === 'sensibles' ? `une eau ${AVIS_LIBELLE.sensibles}` : `une ${AVIS_LIBELLE[cat]}`)

/** Phrase principale d'un avis : attribuée à l'ARS, datée de l'année. */
export const phraseAvis = (cat: AvisCat, annee: string) => `Les conclusions de l’ARS de ${annee} mentionnent ${mentionCat(cat)}.`

/** Texte cité d'une conclusion : celui du fichier, espaces multiples réduites (comme groupesAvis). */
export const texteConclusion = (t: string) => t.replace(/\s{2,}/g, ' ').trim()

interface Categorie {
  cat: AvisCat
  debut: string
  fin: string
  reseaux: string[]
  /** dernière ligne de la catégorie : date, formulation, réseau */
  derniere: LigneAvis
  suite: SuiteAvis | null
  /** causes lues dans les textes de la catégorie, et ces textes */
  causes: string[]
  textes: string[]
}

/** Catégories d'avis de l'année, hors avis limités à un bâtiment, de la plus grave à la moins grave. */
function categories(lignes: readonly LigneAvis[], textes: Textes, annee: string, derniers?: Record<string, string>): Categorie[] {
  const parCat = new Map<AvisCat, Categorie>()
  for (const l of lignes) {
    const [d, id, r] = l
    const x = textes[String(id)]
    if (!d.startsWith(annee) || !x?.t || x.l) continue
    const c = parCat.get(x.c) ?? { cat: x.c, debut: d, fin: d, reseaux: [], derniere: l, suite: null, causes: [], textes: [] }
    for (const k of x.k ?? []) if (!c.causes.includes(k)) c.causes.push(k)
    if (!c.textes.includes(x.t)) c.textes.push(x.t)
    if (d < c.debut) c.debut = d
    if (d > c.fin) c.fin = d
    // Dernière conclusion : la plus récente ; à date égale, la formulation de plus grand identifiant, pour un choix stable.
    if (d > c.derniere[0] || (d === c.derniere[0] && id > c.derniere[1])) c.derniere = l
    if (!c.reseaux.includes(r)) c.reseaux.push(r)
    parCat.set(x.c, c)
  }
  const liste = [...parCat.values()].sort((a, b) => AVIS_CODE[b.cat] - AVIS_CODE[a.cat])
  for (const c of liste) c.suite = suiteAvis(lignes, textes, derniers, c.cat, annee)
  return liste
}

/**
 * Période d'une mention : « Mention relevée sur les réseaux Haut service et Bas service, du 05/01/2026 au 17/07/2026,
 * avis repris jusqu’au dernier prélèvement connu de l’un des réseaux. » Les réseaux ne sont nommés que lorsque le lieu en
 * compte plusieurs.
 */
function phrasePeriode(c: Categorie, noms: ReadonlyMap<string, string>, plusieurs: boolean): string {
  const ou = plusieurs ? ` sur ${c.reseaux.length > 1 ? 'les réseaux' : 'le réseau'} ${liste(c.reseaux.map((r) => noms.get(r) ?? r))},` : ''
  return `Mention relevée${ou} ${periode(c.debut, c.fin)}${c.suite ? `, ${phraseSuite(c.suite, c.debut, c.fin)}` : ''}.`
}

/**
 * La mention en une phrase (maquette « Vision d'ensemble » du 2026-10-06) : « L’ARS a déconseillé l’eau aux nourrissons de
 * moins de 6 mois et aux femmes enceintes (perchlorates) dans ses conclusions du 5 janvier au 17 juillet 2026. » Public
 * et cause tels que les textes de l'ARS les nomment ; la période est celle des conclusions, jamais la durée de la mesure.
 */
export function ligneAvis(c: Pick<Categorie, 'cat' | 'debut' | 'fin' | 'causes' | 'textes'>): string {
  const causes = c.causes.filter((k) => k && k !== 'non précisée')
  const cause = causes.length ? ` (${liste(causes)})` : ''
  const quand = c.debut === c.fin ? `dans sa conclusion du ${dateLongue(c.fin)}` : `dans ses conclusions ${periodeLongue(c.debut, c.fin)}`
  if (c.cat === 'ebullition') return `L’ARS a demandé de faire bouillir l’eau avant consommation${cause} ${quand}.`
  if (c.cat === 'interdiction') return `L’ARS a restreint la consommation de l’eau${cause} ${quand}.`
  const publics = publicsAvis(c.textes)
  return `L’ARS a déconseillé l’eau ${publics.length ? liste(publics.map((p) => `aux ${p}`)) : 'aux publics sensibles'}${cause} ${quand}.`
}

/** Avis de l'année en cours : le plus grave, cité ; « sans information » ; aucun ; ou pas de données. */
export function avisMoment(d: DonneesMoment): AvisMoment {
  if (!d.annee) return { etat: 'sans-donnees', phrase: 'Les données de l’année en cours ne sont pas encore publiées.' }
  const cats = categories(d.lignes, d.textes, d.annee, d.derniers)
  const noms = new Map(d.reseaux.map((r) => [r.code, r.nom]))
  const plusieurs = d.reseaux.length > 1
  if (cats.length) {
    const [c, ...autres] = cats
    const [date, id, reseau] = c.derniere
    const t = d.textes[String(id)]?.t
    return {
      etat: 'avis',
      cat: c.cat,
      ton: toneAvisSuivi(c.cat, false, c.suite),
      phrase: phraseAvis(c.cat, d.annee),
      periode: phrasePeriode(c, noms, plusieurs),
      ligne: ligneAvis(c),
      autres: autres.map((a) => `Les conclusions mentionnent aussi ${mentionCat(a.cat)}. ${phrasePeriode(a, noms, plusieurs)}`),
      citation: t ? { texte: texteConclusion(t), date, reseau: noms.get(reseau) ?? null } : null,
    }
  }
  if (d.sansInfo)
    return {
      etat: 'sans-information',
      phrase: 'Aucune consigne ne figure dans les conclusions publiées.',
      explication: phraseSansInformation(d.annee, d.sansInfo.conclusions, d.sansInfo.lieux),
    }
  if (!d.stats)
    return {
      etat: 'sans-donnees',
      phrase: `Aucun prélèvement de ${d.annee} n’est publié ${d.lieu}.`,
      explication: 'Aucune conclusion de l’ARS de l’année ne peut donc être rapportée.',
    }
  return { etat: 'aucun', phrase: `Aucune consigne ne figure dans les conclusions de l’ARS depuis le 1er janvier ${d.annee}.` }
}

/** Date du dernier prélèvement de l'année : la plus récente des dates d'analyse des paramètres. */
export function dernierPrelevement(s: CommuneYearStats | undefined): string | null {
  let max: string | null = null
  for (const rec of Object.values(s?.cle ?? {})) if (rec[7] && (!max || rec[7] > max)) max = rec[7]
  for (const rec of s?.dep ?? []) if (rec[8] && (!max || rec[8] > max)) max = rec[8]
  return max
}

/**
 * Derniers résultats de l'année en cours : une ligne par famille en cause (non conforme, puis réserve), avec le libellé
 * de sa classe pour l'année (« depuis le 1er janvier » pour les pesticides conformes) et, quand le lieu a plusieurs
 * réseaux, ceux qui atteignent cette classe ; sinon une phrase.
 */
export function resultatsMoment(d: DonneesMoment): ResultatsMoment {
  if (!d.annee) return { etat: 'sans-donnees', phrase: 'Les données de l’année en cours ne sont pas encore publiées.' }
  const c = comptes(d.stats)
  if (!d.stats || !c) return { etat: 'sans-donnees', phrase: `Aucun prélèvement du contrôle sanitaire n’est publié ${d.lieu} depuis le 1er janvier ${d.annee}.` }
  const s = synthese(d.reseaux.map((r) => r.situation))
  const dernier = dernierPrelevement(d.stats)
  const familles = [...s.ennuis, ...s.reserves]
  if (familles.length) {
    const lignes = familles.map((f) => {
      const classe = s.pire[f]!
      const touches = d.reseaux.filter((r) => codeFamille(r.situation, f) === classe).map((r) => r.nom)
      const ou = d.reseaux.length > 1 && touches.length ? ` (${touches.length > 1 ? 'réseaux' : 'réseau'} ${liste(touches)})` : ''
      return { famille: f, ton: toneSituation(f, classe), texte: `${TEXTES_FAMILLES[f].titre} : ${libelleClasse(f, classe, d.annee)}${ou}.` }
    })
    return { etat: 'familles', lignes, prelevements: c.prelevements, dernier }
  }
  const n = fmt.nb(c.prelevements, 'prélèvement')
  if (s.global == null) return { etat: 'sans-ecart', phrase: `Aucune famille soumise à une limite de qualité n’a été analysée depuis le 1er janvier (${n}).`, dernier }
  if (!c.depassements) return { etat: 'sans-ecart', phrase: `Aucun résultat au-dessus d’une limite de qualité depuis le 1er janvier (${n}).`, dernier }
  // Dépassements hors du jugement (canalisations intérieures, matériaux) : la phrase du verdict, synchronisée avec le détail.
  return { etat: 'sans-ecart', phrase: `${phraseVerdict(s, d.annee)} (${n}).`, dernier }
}

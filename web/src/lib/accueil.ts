import { LETTRES_ARS, LIBELLES_ARS } from './bilan'
import { fmt } from './data'
import { classeArs, type LettreArs, type SituationsFile } from './situations'
import { anneesSispea } from './sispea'
import { SUJETS } from './sujets'
import type { SispeaNationalFile } from './types'
import { NIVEAUX_SECHERESSE, rangNiveau } from './vigieau'

/**
 * Accueil, dans l'ordre de l'habitant (maquette « Vision d'ensemble » validée par l'auteur le 2026-10-06, qui remplace
 * celle du 05/10) : la recherche, puis l'eau en France en trois cartes — la qualité (notes A–D de l'année en cours et
 * avis de l'ARS), la sécheresse du jour, le prix et la gestion — et « Pour en savoir plus ». Aucun palmarès ni recommandation sanitaire : des comptes de RÉSEAUX, calculés comme sur les fiches
 * (classeArs, la pire lettre du réseau), des avis attribués à l'ARS et datés, « la mairie et l'ARS font foi ».
 */

// --- Carte « Bilan » ------------------------------------------------------------------------------------------------

export interface ComptesClasses extends Record<LettreArs, number> {
  /** réseaux dont la classe est calculée */
  classes: number
  /** réseaux sans classe calculée (aucune famille analysée, ou fichier antérieur aux classes) */
  nonClasses: number
}

/** Réseaux par classe A–D d'une année, même règle que la fiche (situations.classeArs : famille la plus défavorable). */
export function comptesClasses(situ: SituationsFile): ComptesClasses {
  const c: ComptesClasses = { A: 0, B: 0, C: 0, D: 0, classes: 0, nonClasses: 0 }
  for (const code of Object.keys(situ.reseaux)) {
    const a = classeArs(situ, code)
    if (a) {
      c[a.classe]++
      c.classes++
    } else c.nonClasses++
  }
  return c
}

/** Part d'une classe parmi les réseaux classés (0–1) ; null sans réseau classé. */
export const partClasse = (c: ComptesClasses, l: LettreArs): number | null => (c.classes ? c[l] / c.classes : null)

/** Fractions dites en toutes lettres, seulement quand la part les vaut à un demi-point près. */
const FRACTIONS: readonly [number, string][] = [
  [1 / 2, 'La moitié des réseaux ont'],
  [2 / 3, 'Deux réseaux sur trois ont'],
  [3 / 4, 'Trois réseaux sur quatre ont'],
  [4 / 5, 'Quatre réseaux sur cinq ont'],
  [9 / 10, 'Neuf réseaux sur dix ont'],
]

/**
 * Titre de la carte, calculé : « Les trois quarts des réseaux en classe A » quand la part de la classe A vaut 75 % à un
 * demi-point près (74,97 % en 2025), sinon la part exacte (« 71,1 % des réseaux en classe A »).
 */
export function titreBilan(c: ComptesClasses, annee: string | number): string {
  const p = partClasse(c, 'A')
  if (p == null) return `Notes non calculées pour ${annee}`
  const f = FRACTIONS.find(([v]) => Math.abs(p - v) <= 0.005)
  return f ? `${f[1]} la note A` : `${fmt.pct(100 * p, 1)} des réseaux ont la note A`
}

/** Texte équivalent de la barre empilée (aria-label) : chaque classe, son libellé de l'indicateur et sa part. */
export function texteRepartition(c: ComptesClasses, annee: string | number): string {
  const parts = LETTRES_ARS.map((l) => `${l}, ${LIBELLES_ARS[l]}, ${fmt.pct(100 * (partClasse(c, l) ?? 0), 1)}`)
  return `Répartition des ${fmt.int(c.classes)} réseaux notés en ${annee} : ${parts.join(' ; ')}`
}

/** Date de la carte : « 23 130 réseaux · classes calculées par le site ». */
export const dateBilan = (c: ComptesClasses) => `${fmt.nb(c.classes, 'réseau', 'réseaux')} · notes calculées par le site`

/** Réseaux sans classe calculée, tenus à part (null s'il n'y en a pas). */
export function phraseNonClasses(c: ComptesClasses): string | null {
  if (!c.nonClasses) return null
  return `${fmt.nb(c.nonClasses, 'autre réseau', 'autres réseaux')} sans note, faute d’analyse, ${c.nonClasses > 1 ? 'ne sont' : 'n’est'} pas compté${c.nonClasses > 1 ? 's' : ''}.`
}

// --- Carte « En ce moment » ----------------------------------------------------------------------------------------

/** Période de l'année en cours : « depuis le 1er janvier 2026 » pour un millésime partiel, sinon « en 2025 ». */
export const periodeAvis = (annee: string | number, partiel: boolean) => (partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`)

/** Date de la carte : « depuis le 1er janvier 2026, données arrêtées au 31/07/2026 ». */
export function dateAvis(annee: string | number, partiel: boolean, arret?: string): string {
  const p = partiel ? `depuis le 1er janvier ${annee}` : `année ${annee}`
  return arret ? `${p}, données arrêtées au ${fmt.date(arret)}` : p
}

/**
 * Ligne des avis de l'ARS (auteur, 2026-10-07, « l'ARS demande vraiment de faire bouillir l'eau ? ») : les réseaux ayant
 * fait l'objet d'une restriction de consommation et ceux qui ont reçu une consigne d'ébullition, comptés à part, d'après
 * les conclusions de l'ARS (`interdiction` et `ebullition` d'avis/national.json, ou `reseauxConsignes` d'un département).
 * La consigne d'ébullition est rare ; la phrase ne la met plus sur le même plan que la restriction.
 */
export function texteConsignes(restriction: number, ebullition: number): string {
  const r = restriction > 1 ? `${fmt.int(restriction)} réseaux d’eau ont` : '1 réseau d’eau a'
  if (restriction && ebullition) return `${r} fait l’objet d’une restriction de consommation de l’ARS, et ${fmt.int(ebullition)} d’une consigne d’ébullition.`
  if (restriction) return `${r} fait l’objet d’une restriction de consommation de l’ARS ; aucun d’une consigne d’ébullition.`
  if (ebullition)
    return `Aucun réseau d’eau n’a fait l’objet d’une restriction de consommation de l’ARS ; ${ebullition > 1 ? `${fmt.int(ebullition)} ont` : '1 a'} reçu une consigne d’ébullition.`
  return 'Aucun réseau d’eau n’a fait l’objet d’une restriction de consommation ni d’une consigne d’ébullition de l’ARS.'
}

/** Rappel de la source et de la prudence (maquette du 2026-10-05). */
export const PRUDENCE_AVIS =
  'D’après les conclusions des analyses publiées par l’ARS. Pour toute consigne en vigueur dans une commune, la mairie et l’ARS font foi.'

/**
 * Délégations de l'ARS « sans information » de l'année (avis.sans_information) : leur absence d'avis ne dit rien
 * (règle du 24/09) ; la carte le dit, sans quoi le compte se lirait comme « aucun avis » ailleurs. Null s'il n'y en a pas.
 */
export function phraseSansInformation(n: number, annee: string | number, partiel: boolean): string | null {
  if (!n) return null
  const ou = n > 1 ? `Dans ${fmt.int(n)} départements` : 'Dans un département'
  return `${ou}, l’ARS ne précise pas ses avis dans les résultats publiés ${periodeAvis(annee, partiel)}. L’absence d’avis n’y signifie donc pas qu’il n’y en a pas eu.`
}

// --- Carte « Sécheresse aujourd'hui » -------------------------------------------------------------------------------

/** Départements par niveau du jour (`niveauGraviteMax` de VigiEau), indicés comme NIVEAUX_SECHERESSE (0 : aucune). */
export function comptesSecheresse(depts: readonly { niveauGraviteMax: string | null }[]): number[] {
  const c = NIVEAUX_SECHERESSE.map(() => 0)
  for (const d of depts) c[rangNiveau(d.niveauGraviteMax)]++
  return c
}

const EN_NIVEAU = ['sans restriction', 'en vigilance', 'en alerte', 'en alerte renforcée', 'en crise'] as const

/** Chiffre de tête : le niveau le plus grave atteint par au moins un département (« 79 départements en crise »). */
export function teteSecheresse(c: readonly number[]): { niveau: number; n: number; texte: string } {
  let niveau = 0
  for (let i = c.length - 1; i > 0; i--)
    if (c[i] > 0) {
      niveau = i
      break
    }
  const n = c[niveau] ?? 0
  return { niveau, n, texte: `${n > 1 ? 'départements' : 'département'} ${EN_NIVEAU[niveau]}` }
}

/** Légende du jour, du plus grave au moins grave, sans les niveaux qu'aucun département n'atteint. */
export function legendeSecheresse(c: readonly number[]): { niveau: number; libelle: string; n: number }[] {
  return c
    .map((n, niveau) => ({ niveau, n, libelle: niveau ? NIVEAUX_SECHERESSE[niveau].toLowerCase() : 'sans restriction' }))
    .filter((x) => x.n > 0)
    .reverse()
}

/** Ce que mesure la carte, et ce qu'une restriction sécheresse ne touche pas (règle de « Lire un bulletin »). */
export const PHRASE_SECHERESSE_FRANCE =
  'Niveau le plus élevé sur au moins une zone de chaque département, fixé par arrêté préfectoral. Ces restrictions limitent certains usages de l’eau (arrosage, lavage…) sans en restreindre la consommation.'

// --- Carte « Prix et gestion » -------------------------------------------------------------------------------------

export interface PrixSispea {
  annee: string
  /** prix moyen du m³, pondéré par la population */
  moyen: number
  /** médiane des services déclarants, et leur nombre */
  mediane: number | null
  services: number
  /** part des habitants dont le service est en gestion déléguée (0–1) */
  partDelegation: number | null
}

/**
 * Prix de l'eau en France, ou dans un département (`dd`), pour la dernière année SISPEA assez renseignée
 * (`anneesSispea`, comme /services) : moyenne pondérée par la population, médiane des services, part des habitants
 * dont le service est en gestion déléguée. Null sans prix déclaré cette année-là.
 */
export function prixSispea(nat: SispeaNationalFile | null | undefined, dd?: string): PrixSispea | null {
  const annee = anneesSispea(nat).at(-1)
  if (!annee || !nat) return null
  if (dd) {
    const d = nat.depts[dd]?.[annee]
    if (!d || d.prix.pond == null) return null
    return { annee, moyen: d.prix.pond, mediane: d.prix.p50, services: d.prix.n, partDelegation: d.part_pop_delegation }
  }
  const ny = nat.annees[annee]
  if (!ny || ny.prix.pond == null) return null
  const g = nat.gestion[annee] ?? {}
  const pop = (g.regie?.pop ?? 0) + (g.delegation?.pop ?? 0)
  return { annee, moyen: ny.prix.pond, mediane: ny.prix.p50, services: ny.prix.n, partDelegation: pop ? (g.delegation?.pop ?? 0) / pop : null }
}

/** Ligne de la carte : « Moyenne pondérée par la population ; la médiane des 7 879 services est de 2,44 €. 54 % des habitants… ». */
export function phrasePrix(p: Pick<PrixSispea, 'mediane' | 'services' | 'partDelegation'>): string {
  const mediane =
    p.mediane != null
      ? `Moyenne pondérée par la population ; la médiane ${p.services > 1 ? `des ${fmt.int(p.services)} services` : 'du service'} est de ${fmt.dec(p.mediane, 2)} €.`
      : 'Moyenne pondérée par la population.'
  const gestion = p.partDelegation != null ? ` ${pctInsecable(100 * p.partDelegation, 0)} des habitants relèvent d’un service en gestion déléguée.` : ''
  return mediane + gestion
}

/** Pourcentage dont le signe ne se sépare pas du nombre en fin de ligne (« 66 % » restait seul à la ligne suivante). */
export const pctInsecable = (v: number | null | undefined, d = 1) => fmt.pct(v, d).replace(' %', ' %')

// --- Sujets et ressource -------------------------------------------------------------------------------------------

export interface CarteLien {
  to: string
  titre: string
  texte: string
}

/**
 * Les six sujets de l'accueil (maquette) : une ligne neutre chacun, sans affirmation causale ; les six premiers de la page
 * « Sujets » (lib/sujets.ts, lot 4), dont « Plomb et canalisations » a sa propre page.
 */
export const SUJETS_ACCUEIL: readonly CarteLien[] = SUJETS.slice(0, 6)

/** Pages de la ressource en eau (accueil et sommaire /ressource-en-eau), dans l'ordre de la maquette. */
export const PAGES_RESSOURCE: readonly CarteLien[] = [
  { to: '/secheresse', titre: 'Sécheresse', texte: 'Les restrictions d’usage de l’eau décidées par le préfet, aujourd’hui et depuis 2012.' },
  { to: '/nappes', titre: 'Nappes', texte: 'Le niveau des nappes chaque mois, comparé aux mêmes mois des années passées.' },
  { to: '/ressource', titre: 'Prélèvements et pression', texte: 'L’eau prélevée pour le robinet, les zones en manque d’eau, les fuites et la protection des captages.' },
  { to: '/services', titre: 'Services d’eau et prix', texte: 'Le prix de l’eau, les fuites des réseaux, le renouvellement des tuyaux et le mode de gestion.' },
  { to: '/amont', titre: 'Amont du robinet', texte: 'L’eau prélevée, l’état des nappes et des rivières, les ventes de pesticides.' },
]

/** Phrase de la ressource (maquette), reprise par le sommaire. */
export const PHRASE_RESSOURCE =
  'D’où vient l’eau, le niveau des nappes et les restrictions en cas de sécheresse. Ces informations donnent le contexte ; elles ne jugent pas la qualité de l’eau du robinet.'

/** Phrase de méthode sur les classes, en pied d'accueil (maquette). */
export const PHRASE_CLASSES =
  'Les notes A, B, C et D sont calculées par le site avec la méthode de l’ARS, à partir des analyses publiques. La note officielle de chaque réseau est sur la synthèse de l’ARS jointe à la facture d’eau ; elle fait foi et peut différer. Le site n’est pas une publication officielle.'


// --- Chapeau et « Ce que montre la fiche de votre commune » (refonte du 2026-10-05) ---------------------------------

/** Chapeau de l'accueil, repris par la page pré-générée. */
export const CHAPEAU_ACCUEIL = 'La qualité de l’eau potable de chaque commune de France, d’après le contrôle sanitaire des agences régionales de santé.'

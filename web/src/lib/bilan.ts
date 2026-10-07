import { liste, type ReseauBulletin } from './bulletin'
import { fmt, majuscule } from './data'
import { parseSeuil } from './hubeau'
import { instrument, NBSP, niceCeil, sansFranchir, TEXTES_FAMILLES, valeursReseau, type FamilleReseau, type Reglette } from './instruments'
import { libelleParametre } from './parametres'
import {
  codeFamille,
  enRestriction,
  estPartiel,
  FAMILLES_SITU,
  horsJugement,
  libelleClasse,
  ligneGrilleBact,
  MAX_GERMES,
  NOMS_FAMILLES,
  sansLimite,
  SEUIL_BACT,
  SEUILS_NITRATES,
  synthese,
  toneSituation,
  type BactCumul,
  type LettreArs,
  type Ton,
} from './situations'
import type { CommuneYearStats, ParamInfo } from './types'

/**
 * Carte « Bilan <année> » des fiches commune et réseau (refonte, lot 1, choix de l'auteur du 2026-10-05) : la classe A–D
 * de chaque réseau, calculée par le site selon la méthode de l'indicateur global de l'ARS (situations.classeArs), avec sa
 * cause courte ; puis « Pourquoi la classe », paramètre par paramètre. Toujours dite « classe calculée par le site » : la
 * synthèse annuelle de l'ARS, jointe à la facture, fait foi et peut différer (prudence juridique). Fonctions partagées
 * par les pages et les fiches pré-générées (lib/prerendu.ts).
 */

/** Phrase d'en-tête du bilan (maquette validée le 2026-10-05). */
export const phraseBilan = (plusieurs: boolean) =>
  `Note ${plusieurs ? 'de chaque réseau ' : ''}calculée par le site à partir des analyses publiques, selon la méthode de l’indicateur de l’ARS. La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi et peut différer.`

/** Rappel sous une commune à plusieurs réseaux. */
export const RESEAU_DU_LOGEMENT = 'Le réseau qui dessert un logement figure sur la facture d’eau ; la mairie peut aussi l’indiquer.'

/** Libellés courts des classes, ceux de l'indicateur de l'ARS (marqués d'un astérisque et d'une note). */
export const LIBELLES_ARS: Record<LettreArs, string> = {
  A: 'bonne qualité',
  B: 'qualité convenable',
  C: 'qualité insuffisante',
  D: 'mauvaise qualité',
}
export const NOTE_LIBELLES_ARS = '* Libellés de l’indicateur de l’ARS.'
export const LETTRES_ARS: LettreArs[] = ['A', 'B', 'C', 'D']

/** « Eau de qualité insuffisante* » : libellé de l'indicateur, marqué. */
export const eauDeClasse = (l: LettreArs) => `Eau de ${LIBELLES_ARS[l]}*`

/**
 * Synthèse officielle de l'ARS d'un réseau pour une année close (PDF public joint à la facture, carto.atlasante.fr) ;
 * null pour l'année en cours, qui n'en a pas encore.
 */
export function urlInfofacture(code: string, annee: string | number): string | null {
  if (estPartiel(annee)) return null
  return `https://carto.atlasante.fr/IHM/cartes/infofactures/AQUASISED/${annee}/INFOFACTURE-${code}-${annee}.pdf`
}

export interface LigneBilan {
  code: string
  nom: string
  lettre: LettreArs | null
  /** cause courte : familles qui font la lettre, ou réserves en A, ou ce qui manque */
  cause: string
}

/** Période des prélèvements cumulés : « en 2025 », « de 2024 à 2025 ». */
const periodeCumul = (debut: number, annee: string | number) => (String(debut) === String(annee) ? periodeDe(annee) : `de ${debut} à ${annee}`)

/** « en 2025 », ou « depuis le 1er janvier 2026 » pour l'année en cours (jamais « en 2026 » d'un bilan partiel). */
const periodeDe = (annee: string | number) => (estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`)

/**
 * Prélèvements bactériologiques de la note, dans les termes de la grille de l'ARS : « 87 % de prélèvements conformes
 * sur 16, de 2024 à 2025 », puis le maximum d'E. coli ou d'entérocoques quand il atteint MAX_GERMES. Le taux s'arrondit
 * sans franchir les seuils de la grille (89,6 % ne s'écrit pas « 90 % »).
 */
export function texteBact(b: BactCumul, annee: string | number): string {
  const taux = (100 * (b.n - b.nc)) / b.n
  const [, seuilD, seuilA] = ligneGrilleBact(b.n)
  const pct = sansFranchir(taux, [seuilD, seuilA], (p) => fmt.pct(taux, p), 1)
  const max = b.max >= MAX_GERMES ? `, jusqu’à ${fmt.sig(b.max)} E. coli ou entérocoques pour 100${NBSP}mL` : ''
  return `${pct} de prélèvements conformes sur ${fmt.int(b.n)}, ${periodeCumul(b.debut, annee)}${max}`
}

/** Famille dans une cause : « Pesticides : dépassements plus de 30 jours ». */
const causeFamille = (f: FamilleReseau, classe: number, annee: string | number) => `${majuscule(NOMS_FAMILLES[f])} : ${libelleClasse(f, classe, annee)}`

/** Ce qu'une note A ne retient pas d'une famille non conforme au bulletin (grille de l'ARS, 2026-10-05). */
const NON_RETENU: Partial<Record<FamilleReseau, string>> = {
  pfas: 'un dépassement isolé de la limite des PFAS, non confirmé dans l’année',
  microbio: 'les prélèvements bactériologiques non conformes, en deçà des seuils de la grille de l’ARS',
}

/** Ligne du bilan d'un réseau : lettre et cause courte (familles dont la lettre est celle du réseau). */
export function ligneBilan(r: ReseauBulletin, annee: string | number): LigneBilan {
  const ars = r.ars
  const base = { code: r.code, nom: r.nom }
  if (!ars) {
    const cause = r.situation ? `Pas de note ${periodeDe(annee)}.` : `Aucune analyse rattachée à ce réseau ${periodeDe(annee)} ; pas de note.`
    return { ...base, lettre: null, cause }
  }
  if (ars.classe === 'A') {
    const s = synthese([r.situation])
    const cause = s.reserves.length
      ? `Conforme aux limites de qualité prises en compte, avec ${s.reserves.length > 1 ? 'des réserves' : 'une réserve'} : ${s.reserves.map((f) => `${NOMS_FAMILLES[f]}, ${libelleClasse(f, s.pire[f]!, annee)}`).join(' ; ')}.`
      : 'Conforme aux limites de qualité prises en compte par la note.'
    // Dépassement constaté au bulletin mais non retenu par la note (PFAS non confirmé, bactériologie sous la grille).
    const nonRetenus = s.ennuis.flatMap((f) => (NON_RETENU[f] ? [NON_RETENU[f]] : []))
    return { ...base, lettre: 'A', cause: nonRetenus.length ? `${cause} La note ne retient pas ${liste(nonRetenus)}.` : cause }
  }
  const causes = FAMILLES_SITU.filter((f) => ars.familles[f] === ars.classe).map((f) => {
    if (ars.reportees.includes(f)) return `${majuscule(NOMS_FAMILLES[f])} : d’après les résultats des années précédentes`
    if (f === 'microbio' && ars.bact) return `${majuscule(NOMS_FAMILLES[f])} : ${texteBact(ars.bact, annee)}`
    const c = codeFamille(r.situation, f)
    return c == null ? majuscule(NOMS_FAMILLES[f]) : causeFamille(f, c, annee)
  })
  return { ...base, lettre: ars.classe, cause: `${causes.join(' ; ')}.` }
}

/** Lignes du bilan, dans l'ordre donné (ordreReseaux des pages). */
export const lignesBilan = (reseaux: readonly ReseauBulletin[], annee: string | number) => reseaux.map((r) => ligneBilan(r, annee))

/** Lettre la plus défavorable des réseaux ; null sans classe calculée. */
export function pireLettre(reseaux: readonly Pick<ReseauBulletin, 'ars'>[]): LettreArs | null {
  return reseaux.reduce<LettreArs | null>((a, r) => (r.ars && (!a || r.ars.classe > a) ? r.ars.classe : a), null)
}

/** Lettres distinctes, de la plus favorable à la plus défavorable : description des fiches (lib/prerendu.ts). */
export function lettresDistinctes(reseaux: readonly Pick<ReseauBulletin, 'ars'>[]): LettreArs[] {
  return [...new Set(reseaux.flatMap((r) => (r.ars ? [r.ars.classe] : [])))].sort()
}

// --- « Pourquoi la classe » ----------------------------------------------------------------------------

/** Réseau du bilan avec ses statistiques de l'année. */
export interface ReseauPourquoi extends ReseauBulletin {
  stats: CommuneYearStats | undefined
}

export interface JaugePourquoi {
  reglette: Reglette
  ton: Ton | null
  nom: string
  libelle: string
}

export interface FamillePourquoi {
  famille: FamilleReseau
  titre: string
  /** lettre la plus défavorable de la famille ; null pour une réserve seule */
  lettre: LettreArs | null
  phrases: string[]
  jauge: JaugePourquoi | null
}

/** Titre de « Pourquoi la note » (la classe A–D, dite « note » sur les fiches depuis la refonte du 2026-10-05) ; « Les réserves de la note A » quand il n'y a que des réserves. */
export const titrePourquoi = (l: LettreArs) => (l === 'A' ? 'Les réserves de la note A' : `Pourquoi la note ${l}`)

/** Nombre de paramètres écrits par famille ; les autres sont comptés et renvoyés au détail. */
const PARAMS_MAX = 4

/** Réglette d'un paramètre : de 0 à une borne lisible, repère de la limite, valeur maximale de l'année. */
function reglettePourquoi(max: number, limite: number, unite: string): Reglette {
  const fin = niceCeil(Math.max(limite * 1.5, max * 1.15))
  const u = unite ? `${NBSP}${unite}` : ''
  return {
    forme: 'reglette',
    min: 0,
    max: fin,
    unite,
    reperes: [limite],
    limite,
    horsLimite: [limite, fin],
    // Une limite très basse sur l'échelle : son étiquette recouvrirait celle du zéro, qui est omise.
    graduations: (limite / fin < 0.12 ? [limite, fin] : [0, limite, fin]).map((v) => ({ v, t: fmt.sig(v) })),
    valeur: max,
    lecture: `${sansFranchir(max, [limite], (p) => fmt.sig(max, p), 3)}${u}`,
  }
}

/** Écrit « 0,1 µg/L ». */
const avecUnite = (v: number, u: string | null) => `${fmt.sig(v)}${u ? `${NBSP}${u}` : ''}`

/**
 * « Pourquoi la classe » : pour chaque famille dont un réseau est au-delà de A, ou en réserve, des phrases factuelles
 * (paramètre, maximum, limite, analyses au-dessus sur le total, réseaux) et une jauge. Jamais d'origine supposée d'une
 * pollution ni de statut d'un produit : seulement les mesures publiées. Les paramètres hors du jugement (canalisations,
 * matériaux, métabolites non pertinents) n'y figurent pas, comme dans la classe.
 */
export function pourquoi(reseaux: readonly ReseauPourquoi[], params: Record<string, ParamInfo>, annee: string): FamillePourquoi[] {
  const plusieurs = reseaux.length > 1
  // Phrase d'un réseau : son nom en tête quand il y en a plusieurs, sinon la phrase seule, capitale initiale.
  const deReseau = (r: ReseauPourquoi, texte: string) => (plusieurs ? `${r.nom} : ${texte}` : majuscule(texte))
  const sortie: FamillePourquoi[] = []
  for (const f of FAMILLES_SITU) {
    const lettre = (r: ReseauPourquoi): LettreArs | null => r.ars?.familles[f] ?? null
    const enCause = reseaux.filter((r) => (lettre(r) ?? 'A') > 'A')
    const reserve = reseaux.filter((r) => (lettre(r) ?? 'A') === 'A' && synthese([r.situation]).reserves.includes(f))
    if (!enCause.length && !reserve.length) continue
    const concernes = [...enCause, ...reserve]
    const pire = enCause.reduce<LettreArs | null>((a, r) => (!a || lettre(r)! > a ? lettre(r) : a), null)
    const phrases: string[] = []
    let jauge: JaugePourquoi | null = null

    // Lettre reprise d'une année antérieure : aucune analyse de la famille dans l'année.
    for (const r of concernes.filter((x) => x.ars?.reportees.includes(f)))
      phrases.push(deReseau(r, `aucune analyse de cette famille ${periodeDe(annee)} ; la note reprend les résultats des années précédentes, cinq ans au plus.`))
    const mesures = concernes.filter((x) => !x.ars?.reportees.includes(f))

    if (f === 'azote' || f === 'microbio') {
      let reference: { r: ReseauPourquoi; classe: number; cle: number } | null = null
      for (const r of mesures) {
        const classe = codeFamille(r.situation, f)
        if (classe == null) continue
        const v = valeursReseau(r.stats, params)
        if (f === 'azote' && v.nitratesMax != null) {
          const limite = SEUILS_NITRATES[SEUILS_NITRATES.length - 1]
          const lu = `${sansFranchir(v.nitratesMax, SEUILS_NITRATES, (p) => fmt.dec(v.nitratesMax!, p), 1)}${NBSP}mg/L`
          phrases.push(deReseau(r, `concentration maximale de ${lu} ${periodeDe(annee)}, pour une limite de qualité de ${limite}${NBSP}mg/L.`))
          if (!reference || v.nitratesMax > reference.cle) reference = { r, classe, cle: v.nitratesMax }
        }
        if (f === 'microbio' && r.ars?.bact) {
          const [, seuilD, seuilA] = ligneGrilleBact(r.ars.bact.n)
          phrases.push(deReseau(r, `${texteBact(r.ars.bact, annee)}.`))
          phrases.push(
            deReseau(
              r,
              `pour ce nombre de prélèvements, la grille de l’ARS retient la note A à partir de ${seuilA}${NBSP}% de prélèvements conformes et un maximum inférieur à ${MAX_GERMES} germes pour 100${NBSP}mL, la note D en dessous de ${seuilD}${NBSP}%.`,
            ),
          )
        }
        if (f === 'microbio' && v.bacterio) {
          const { nonConformes, evalues } = v.bacterio
          const germes = (v.enCause.microbio ?? []).map((p) => libelleParametre(p.code, p.libelle))
          phrases.push(
            deReseau(r, `${fmt.nb(nonConformes, 'prélèvement non conforme', 'prélèvements non conformes')} sur ${fmt.int(evalues)} ${periodeDe(annee)}${germes.length ? ` (${liste(germes)})` : ''}.`),
          )
          const part = nonConformes / evalues
          if (!reference || part > reference.cle) reference = { r, classe, cle: part }
        }
        if (enRestriction(f, classe)) phrases.push(deReseau(r, 'une consigne ou une restriction figure dans les conclusions de l’ARS de l’année pour cette famille.'))
      }
      if (reference) {
        const i = instrument(f, reference.classe, valeursReseau(reference.r.stats, params), annee)
        if (i.echelle.forme === 'reglette' && i.echelle.valeur != null)
          jauge = { reglette: i.echelle, ton: i.ton, nom: `${TEXTES_FAMILLES[f].titre}${plusieurs ? `, ${reference.r.nom}` : ''}`, libelle: f === 'azote' ? `limite de qualité ${SEUILS_NITRATES[2]}${NBSP}mg/L` : `seuil de bonne qualité des bilans de l’ARS ${Math.round(SEUIL_BACT * 100)}${NBSP}% de prélèvements conformes` }
      }
    } else {
      // Paramètres au-dessus de leur limite, réunis sur les réseaux concernés.
      const parParam = new Map<string, { analyses: number; depassements: number; max: number | null; reseaux: string[] }>()
      for (const r of mesures) {
        for (const p of valeursReseau(r.stats, params).enCause[f] ?? []) {
          if (horsJugement(p.code) || sansLimite(p.code, annee)) continue
          const a = parParam.get(p.code) ?? { analyses: 0, depassements: 0, max: null, reseaux: [] }
          a.analyses += p.analyses
          a.depassements += p.depassements
          if (p.max != null && (a.max == null || p.max > a.max)) a.max = p.max
          if (!a.reseaux.includes(r.nom)) a.reseaux.push(r.nom)
          parParam.set(p.code, a)
        }
      }
      const tries = [...parParam.entries()].sort((x, y) => y[1].depassements - x[1].depassements || x[0].localeCompare(y[0]))
      let rapport = 0
      for (const [code, a] of tries.slice(0, PARAMS_MAX)) {
        const info = params[code]
        const limite = parseSeuil(info?.lim).max
        const u = info?.u ?? null
        const lib = libelleParametre(code, info?.l)
        const max = a.max != null ? `, maximum ${avecUnite(a.max, u)}` : ''
        const lim = limite != null ? ` de ${avecUnite(limite, u)}` : ''
        const ou = plusieurs ? ` (${a.reseaux.length > 1 ? 'réseaux' : 'réseau'} ${liste(a.reseaux)})` : ''
        phrases.push(`${lib} : ${fmt.nb(a.depassements, 'analyse')} au-dessus de la limite de qualité${lim} sur ${fmt.int(a.analyses)}${max}${ou}.`)
        // Jauge : le paramètre clé de la famille (« Total pesticides ») s'il est en cause, sinon le plus haut face à sa limite.
        const poids = a.max != null && limite ? (info?.k ? Infinity : a.max / limite) : 0
        if (limite != null && limite > 0 && a.max != null && poids > rapport) {
          rapport = poids
          const pireClasse = Math.max(...mesures.map((r) => codeFamille(r.situation, f) ?? 0))
          jauge = { reglette: reglettePourquoi(a.max, limite, u ?? ''), ton: toneSituation(f, pireClasse), nom: lib, libelle: `limite de qualité ${avecUnite(limite, u)}` }
        }
      }
      const reste = tries.length - PARAMS_MAX
      if (reste > 0) phrases.push(`${fmt.nb(reste, 'autre paramètre a', 'autres paramètres ont')} aussi dépassé ${reste > 1 ? 'leur' : 'sa'} limite ; ils figurent dans « Le détail par famille ».`)
      for (const r of mesures) {
        const c = codeFamille(r.situation, f)
        if (c != null && enRestriction(f, c)) phrases.push(deReseau(r, 'une restriction de consommation ou une consigne figure dans les conclusions de l’ARS de l’année pour cette famille.'))
      }
      if (!phrases.length) phrases.push('Le détail des analyses de cette famille figure dans « Le détail par famille ».')
    }
    sortie.push({ famille: f, titre: TEXTES_FAMILLES[f].titre, lettre: pire, phrases, jauge })
  }
  // Le plus grave d'abord, les réserves seules à la fin ; ordre des bilans à gravité égale.
  return sortie.sort((a, b) => (b.lettre ?? '').localeCompare(a.lettre ?? ''))
}

/** Page de thème d'une famille (« Comprendre », Pour aller plus loin) ; les autres limites de qualité n'en ont pas. */
export const THEME_DE_FAMILLE: Partial<Record<FamilleReseau, { slug: string; titre: string }>> = {
  pesticides: { slug: 'pesticides', titre: 'les pesticides' },
  azote: { slug: 'nitrates', titre: 'les nitrates' },
  pfas: { slug: 'pfas', titre: 'les PFAS' },
  microbio: { slug: 'bacteries', titre: 'la bactériologie' },
  metaux_mineraux: { slug: 'metaux', titre: 'les métaux et minéraux' },
}

/** Lettre qui titre « Pourquoi la classe » : la plus défavorable, ou A quand il n'y a que des réserves ; null sinon. */
export function lettrePourquoi(reseaux: readonly ReseauBulletin[], familles: readonly FamillePourquoi[]): LettreArs | null {
  if (!familles.length) return null
  return pireLettre(reseaux) ?? 'A'
}

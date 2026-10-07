import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { declarerPartiels } from './situations'
import { defaultYear, type MetaFile } from './types'

const KEY = 'annee'

/** Année proposée par la barre d'année d'une fiche (components/BarreAnnee.tsx). */
export interface AnneeFiche {
  annee: number
  /** millésime encore en cours de publication (meta.partiel) */
  enCours: boolean
  /** aucune donnée pour cette fiche cette année-là */
  sansDonnees: boolean
}

/**
 * Années d'une fiche : toutes celles du site, dans l'ordre. Celles où la fiche n'a pas de données restent
 * proposées, mais signalées : la fiche le dit alors en clair au lieu de basculer en silence sur une autre année.
 * Sans liste de `disponibles`, aucune n'est signalée.
 */
export function anneesFiche(meta: MetaFile | null, disponibles?: Iterable<string | number>): AnneeFiche[] {
  if (!meta) return []
  const dispo = disponibles ? new Set([...disponibles].map(String)) : null
  return meta.annees.map((a) => ({ annee: a, enCours: (meta.partiel ?? []).includes(a), sansDonnees: dispo != null && !dispo.has(String(a)) }))
}

/** Choix fait par le visiteur sur une barre d'année (setYear), distinct de l'année simplement affichée. */
const KEY_CHOIX = 'annee-choisie'

function readSession(cle = KEY): number | undefined {
  try {
    const v = sessionStorage.getItem(cle)
    return v ? Number(v) : undefined
  } catch {
    return undefined
  }
}

/**
 * Options des fiches commune et réseau (refonte, lot 1, choix de l'auteur du 2026-10-05) : elles s'ouvrent sur le
 * dernier millésime complet (`defaut: dernierComplet`), l'année en cours ayant sa propre carte « En ce moment ». La
 * session n'y vaut que pour une année choisie sur une barre (`choixSeul`) : l'année que les autres pages écrivent
 * d'office dans l'adresse (l'année en cours) l'aurait sinon toujours emporté.
 */
export interface OptionsAnnee {
  defaut?: (meta: MetaFile | null) => number | undefined
  choixSeul?: boolean
}

/**
 * Millésime partagé entre toutes les pages.
 * Priorité : paramètre d'URL `?annee=` (partageable, pilote aussi le mode studio), puis dernier choix de la
 * session, puis l'année par défaut : la plus récente, l'année en cours comprise (defaultYear), ou celle des options.
 * Une valeur absente de `meta.annees` est ignorée. Déclare aussi les millésimes partiels, dont les libellés disent
 * « depuis le 1er janvier ».
 */
export function useYear(meta: MetaFile | null, options: OptionsAnnee = {}): [number | undefined, (y: number) => void] {
  if (meta) declarerPartiels(meta.partiel ?? [])
  const [params, setParams] = useSearchParams()
  const fromUrl = Number(params.get(KEY)) || undefined
  const valid = (y: number | undefined) => y != null && (!meta || meta.annees.includes(y))
  const year = [fromUrl, readSession(options.choixSeul ? KEY_CHOIX : KEY), (options.defaut ?? defaultYear)(meta)].find(valid)
  // Un millésime reçu par l'URL devient le choix de la session, pour suivre l'utilisateur de page en page.
  useEffect(() => {
    if (fromUrl && valid(fromUrl)) {
      try {
        sessionStorage.setItem(KEY, String(fromUrl))
      } catch {
        /* stockage indisponible */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl, meta])
  const setYear = useCallback(
    (y: number) => {
      try {
        sessionStorage.setItem(KEY, String(y))
        sessionStorage.setItem(KEY_CHOIX, String(y))
      } catch {
        /* stockage indisponible */
      }
      const next = new URLSearchParams(params)
      next.set(KEY, String(y))
      setParams(next, { replace: true })
    },
    [params, setParams],
  )
  return [year, setYear]
}

/**
 * L'année affichée, toujours écrite dans l'adresse (choix de l'auteur, 25/09, relevé « Parcours du robinet ») : elle
 * suivait le visiteur par la session sans figurer dans l'adresse, si bien que « Partager » ou un favori ouvrait l'année
 * par défaut chez le destinataire, et un lien partagé aurait suivi le défaut quand il change. L'entrée d'historique est
 * remplacée : le bouton Retour ne compte pas ce pas. Appelé par la barre d'année (components/BarreAnnee), avec la clé
 * de sa page : `annee` (contrôle sanitaire), `sispea`, `amont`.
 */
export function useAnneeDansAdresse(param: string, annee: number | undefined): void {
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (annee == null || params.get(param) === String(annee)) return
    const next = new URLSearchParams(params)
    next.set(param, String(annee))
    // L'ancre suit : setSearchParams la perdait, et la section ouverte par un lien (#services d'une fiche département)
    // se refermait sur le haut de page (vérification du 25/09).
    navigate({ search: `?${next.toString()}`, hash }, { replace: true })
  }, [param, annee, params, hash, navigate])
}

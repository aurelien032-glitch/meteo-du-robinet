import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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

function readSession(): number | undefined {
  try {
    const v = sessionStorage.getItem(KEY)
    return v ? Number(v) : undefined
  } catch {
    return undefined
  }
}

/**
 * Millésime partagé entre toutes les pages.
 * Priorité : paramètre d'URL `?annee=` (partageable, pilote aussi le mode studio), puis dernier choix de la
 * session, puis dernier millésime complet. Une valeur absente de `meta.annees` est ignorée.
 */
export function useYear(meta: MetaFile | null): [number | undefined, (y: number) => void] {
  const [params, setParams] = useSearchParams()
  const fromUrl = Number(params.get(KEY)) || undefined
  const valid = (y: number | undefined) => y != null && (!meta || meta.annees.includes(y))
  const year = [fromUrl, readSession(), defaultYear(meta)].find(valid)
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

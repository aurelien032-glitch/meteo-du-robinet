import { useCallback, useEffect, useState } from 'react'
import { loadJson } from './data'

type State<T> = { data: T | null; error: string | null; path: string | null }

/** Charge un fichier JSON du pipeline ; `path` à null suspend le chargement. */
export function useJson<T>(path: string | null): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, path: null })
  useEffect(() => {
    if (!path) return
    let alive = true
    loadJson<T>(path).then(
      (d) => alive && setState({ data: d, error: null, path }),
      (e) => {
        // La plupart des pages ne lisent pas `.error` (elles retombent sur leur garde « Chargement… ») ;
        // sans ce log, une vraie panne réseau serait indiscernable d'un chargement normal.
        console.error(`[useJson] ${path}`, e)
        if (alive) setState({ data: null, error: String(e), path })
      },
    )
    return () => {
      alive = false
    }
  }, [path])
  const current = state.path === path
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!path && !current }
}

/**
 * Charge plusieurs fichiers à la fois (les fichiers départementaux d'un service à cheval sur deux
 * départements, par exemple) ; `data` ne vaut quelque chose qu'une fois TOUS chargés, pour ne jamais
 * calculer un total sur une partie des fichiers. Liste vide : rien à charger, `data` reste null.
 */
export function useJsonAll<T>(paths: readonly string[]): { data: T[] | null; error: string | null; loading: boolean } {
  // Clé stable d'un rendu à l'autre : l'appelant reconstruit souvent un nouveau tableau à chaque rendu.
  const key = paths.join('\n')
  const [state, setState] = useState<State<T[]>>({ data: null, error: null, path: null })
  useEffect(() => {
    if (!key) return
    let alive = true
    Promise.all(key.split('\n').map((p) => loadJson<T>(p))).then(
      (d) => alive && setState({ data: d, error: null, path: key }),
      (e) => {
        console.error(`[useJsonAll] ${key.replace(/\n/g, ', ')}`, e)
        if (alive) setState({ data: null, error: String(e), path: key })
      },
    )
    return () => {
      alive = false
    }
  }, [key])
  const current = state.path === key
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!key && !current }
}

/**
 * Vrai dès que `pret` l'a été une fois pour cette `cle` (une fiche, une page) : la page attend ses données du haut et se
 * dessine d'un seul tenant, au lieu d'insérer chaque bloc au-dessus de ceux déjà affichés (décalage de la mise en page de
 * 0,2 à 0,9 sur les fiches, La France et l'accueil, audit UI UX Pro Max du 2026-10-06). Ensuite, un changement d'année
 * garde la page en place : la barre d'année, que le visiteur vient d'utiliser, ne disparaît pas.
 */
export function usePremierRendu(pret: boolean, cle = ''): boolean {
  const [vu, setVu] = useState<string | null>(pret ? cle : null)
  if (pret && vu !== cle) setVu(cle)
  return pret || vu === cle
}

/**
 * Réglage d'affichage des cartes, mémorisé d'une carte et d'une visite à l'autre : « Noms » (`carte-noms`) et « Encarts »
 * (`carte-encarts`), communs à FranceMap et à la carte de l'accueil (CarteDepartements). Lu à la création de la carte ;
 * stockage indisponible : `defaut`, et le choix vaut pour cette visite.
 */
export function useReglageCarte(cle: string, defaut = true): [boolean, () => void] {
  const [actif, setActif] = useState(() => {
    try {
      const v = localStorage.getItem(cle)
      return v == null ? defaut : v !== '0'
    } catch {
      return defaut
    }
  })
  const basculer = useCallback(
    () =>
      setActif((v) => {
        try {
          localStorage.setItem(cle, v ? '0' : '1')
        } catch {
          /* stockage indisponible : le choix vaut pour cette visite */
        }
        return !v
      }),
    [cle],
  )
  return [actif, basculer]
}

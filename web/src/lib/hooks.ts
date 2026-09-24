import { useEffect, useState } from 'react'
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

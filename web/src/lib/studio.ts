import { useEffect, useState } from 'react'

/**
 * Mode studio : la page devient une scène 16:9 de 1920×1080, thème sombre, typographie agrandie,
 * pensée pour l'enregistrement d'écran (OBS) et l'export d'images pour les vidéos.
 * Activation : ?studio=1 dans l'URL, ou touche « s ». L'état est mémorisé dans localStorage.
 *
 * La touche « s » n'agit que dans un navigateur où l'URL ?studio=… a déjà été ouverte (drapeau
 * `studio-outil`) : sur le site public, un visiteur qui tapait « s » basculait toute la page en scène
 * noire 1920×1080, et ce choix restait mémorisé (revue du 2026-09-22).
 */
const OUTIL = 'studio-outil'
function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
export function useStudio(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    const q = new URLSearchParams(window.location.search).get('studio')
    if (q != null) {
      try {
        localStorage.setItem(OUTIL, '1')
      } catch {
        /* stockage indisponible : la touche restera inactive */
      }
      return q === '1'
    }
    return lire(OUTIL) === '1' && lire('studio') === '1'
  })
  useEffect(() => {
    document.documentElement.classList.toggle('studio', on)
    try {
      localStorage.setItem('studio', on ? '1' : '0')
    } catch {
      /* stockage indisponible : on ignore */
    }
  }, [on])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      // e.key reste 's' quand une touche de modification est tenue : sans ce garde, Ctrl+S / Cmd+S
      // (enregistrer la page) basculerait tout le site en mode studio au lieu d'ouvrir la boîte de dialogue.
      if (lire(OUTIL) !== '1') return
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') setOn((v) => !v)
    }
    // Les scènes vidéo demandent le mode studio sans passer par le clavier.
    const onCustom = (e: Event) => setOn(Boolean((e as CustomEvent<boolean>).detail))
    window.addEventListener('keydown', onKey)
    window.addEventListener('robinet:studio', onCustom)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('robinet:studio', onCustom)
    }
  }, [])
  return [on, setOn]
}

/** Échelle pour faire tenir la scène 1920×1080 dans la fenêtre. */
export function useStageScale(active: boolean): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    if (!active) return
    const update = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [active])
  return active ? scale : 1
}

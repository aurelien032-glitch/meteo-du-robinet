import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const KEY = 'densite' // pas "vue" : déjà pris par Departement.tsx pour le choix d'indicateur

export type Densite = 'essentiel' | 'detaille'

const estValide = (v: string | null | undefined): v is Densite => v === 'essentiel' || v === 'detaille'

function lireSession(): Densite | undefined {
  try {
    const v = sessionStorage.getItem(KEY)
    return estValide(v) ? v : undefined
  } catch {
    return undefined
  }
}

/**
 * Densité de lecture partagée entre toutes les pages (identité « Bulletin météo », 2026-09-23) :
 * « Essentiel » (défaut) garde les sections repliées comme aujourd'hui, « Détaillé » les ouvre toutes
 * au chargement — même priorité URL → session → défaut que `useYear` (lib/year.ts), même motif de
 * persistance. Contrairement au millésime, pas de validation contre un jeu de valeurs possibles : les
 * deux densités sont toujours valides, sur toutes les pages.
 */
export function useDensite(): [Densite, (d: Densite) => void] {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get(KEY)
  const densite = ([estValide(fromUrl) ? fromUrl : undefined, lireSession(), 'essentiel'] as const).find(estValide)!
  // Une densité reçue par l'URL devient le choix de la session, pour suivre le visiteur de page en page.
  useEffect(() => {
    if (estValide(fromUrl)) {
      try {
        sessionStorage.setItem(KEY, fromUrl)
      } catch {
        /* stockage indisponible */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl])
  const setDensite = useCallback(
    (d: Densite) => {
      try {
        sessionStorage.setItem(KEY, d)
      } catch {
        /* stockage indisponible */
      }
      const next = new URLSearchParams(params)
      next.set(KEY, d)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )
  return [densite, setDensite]
}

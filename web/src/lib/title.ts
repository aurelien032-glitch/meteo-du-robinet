import { useEffect } from 'react'

const BASE = "Météo du robinet · l'eau potable en France, de la ressource au robinet"

/** Titre d'onglet et description par page, pour le partage et les moteurs de recherche. */
export function usePageTitle(title?: string | null, description?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · Météo du robinet` : BASE
    const meta = document.querySelector('meta[name="description"]')
    if (meta && description) meta.setAttribute('content', description)
    return () => {
      document.title = BASE
    }
  }, [title, description])
}

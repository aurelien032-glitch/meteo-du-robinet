import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { liensPartage } from '../lib/partage'

/**
 * Bouton « Partager » de l'en-tête, sur toutes les pages (demande de l'auteur, 2026-09-24) : LinkedIn, Facebook,
 * courriel et copie du lien. L'adresse partagée est celle de la barre d'adresse au moment du clic : la vue en cours
 * (année, indicateur, département…) part avec elle. Panneau refermé par Échap, par un clic ailleurs et à chaque
 * changement de page ou de vue.
 */
export default function Partage() {
  const [ouvert, setOuvert] = useState(false)
  const [statut, setStatut] = useState('')
  const bouton = useRef<HTMLButtonElement>(null)
  const panneau = useRef<HTMLDivElement>(null)
  const { pathname, search } = useLocation()
  useEffect(() => setOuvert(false), [pathname, search])
  useEffect(() => {
    if (!ouvert) return
    const ailleurs = (e: MouseEvent) => {
      const cible = e.target as Node
      if (!panneau.current?.contains(cible) && !bouton.current?.contains(cible)) setOuvert(false)
    }
    document.addEventListener('mousedown', ailleurs)
    return () => document.removeEventListener('mousedown', ailleurs)
  }, [ouvert])

  const copier = async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setStatut('Lien copié.')
    } catch {
      setStatut(`La copie a échoué. Adresse de la page : ${url}`)
    }
    window.setTimeout(() => setStatut(''), 4000)
  }

  return (
    <div className="partage">
      <button
        ref={bouton}
        type="button"
        className="partage-btn"
        aria-expanded={ouvert}
        aria-controls="partage-panneau"
        onClick={() => setOuvert((o) => !o)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 12.5V3M6.5 6.5 10 3l3.5 3.5M4.5 10.5v6h11v-6" />
        </svg>
        <span className="partage-texte">Partager</span>
      </button>
      {ouvert && (
        <div
          ref={panneau}
          id="partage-panneau"
          className="partage-panneau"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOuvert(false)
              bouton.current?.focus()
            }
          }}
        >
          <p className="partage-titre">Partager cette page</p>
          <ul>
            {liensPartage(window.location.href, document.title).map((l) => (
              <li key={l.reseau}>
                <a href={l.href} {...(l.externe ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                  {l.label}
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
            <li>
              <button type="button" onClick={copier}>
                Copier le lien
              </button>
            </li>
          </ul>
          <p className="partage-statut" role="status">
            {statut}
          </p>
        </div>
      )}
    </div>
  )
}

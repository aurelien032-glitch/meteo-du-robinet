import type { ReactNode } from 'react'
import type { Ton } from '../lib/situations'

const FORMES: Record<Ton | 'na', ReactNode> = {
  na: <circle className="v-anneau" cx="12" cy="12" r="10" />,
  good: (
    <>
      <circle className="v-forme" cx="12" cy="12" r="11.2" />
      <path className="v-trait" d="M7.2 12.4l3.2 3.2 6.4-6.6" />
    </>
  ),
  warn: (
    <>
      <path className="v-forme" d="M12 1.6c.72 0 1.38.38 1.74 1.01l9.66 16.9c.74 1.3-.2 2.9-1.74 2.9H2.34c-1.54 0-2.48-1.6-1.74-2.9l9.66-16.9A2 2 0 0 1 12 1.6z" />
      <rect className="v-signe" x="10.85" y="8.2" width="2.3" height="7.4" rx="1.15" />
      <circle className="v-signe" cx="12" cy="18.7" r="1.4" />
    </>
  ),
  bad: (
    <>
      <path className="v-forme" d="M7.3 .9h9.4l6.4 6.4v9.4l-6.4 6.4H7.3L.9 16.7V7.3z" />
      <rect className="v-signe" x="5.4" y="10.55" width="13.2" height="2.9" rx="1.2" />
    </>
  ),
}

/**
 * Voyant du sémaphore (maquette du 23/09) : la forme porte l'état autant que la couleur — cercle coché
 * (conforme), triangle (non conforme), octogone (restriction ou consigne), anneau pointillé (non analysée).
 * Décoratif : le libellé écrit à côté dit l'état.
 */
export default function Voyant({ ton, taille = 20 }: { ton: Ton | null; taille?: number }) {
  const t = ton ?? 'na'
  return (
    <svg className={`voyant tone-${t}`} width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {FORMES[t]}
    </svg>
  )
}

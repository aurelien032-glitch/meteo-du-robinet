import { useState, useSyncExternalStore } from 'react'
import { registreEchecs } from '../lib/data'

/**
 * État d'attente d'une page ou d'un encart. Si un fichier de données a échoué depuis l'apparition de ce
 * message, il est remplacé par l'erreur et un bouton pour réessayer, au lieu d'attendre indéfiniment.
 */
export default function Chargement({ texte = 'Chargement…', carte = false }: { texte?: string; carte?: boolean }) {
  const [depuis] = useState(() => Date.now() - 1000)
  const echecs = useSyncExternalStore(registreEchecs.abonner, registreEchecs.lire).filter(([, e]) => e.t >= depuis)
  const cls = carte ? 'card muted' : 'muted'
  if (!echecs.length) return <div className={cls}>{texte}</div>
  return (
    <div className={carte ? 'card' : undefined} role="alert">
      <p>
        <b>Données indisponibles.</b>{' '}
        <span className="muted">
          {echecs.length === 1 ? `Le fichier ${echecs[0][0]} n'a pas pu être chargé.` : `${echecs.length} fichiers n'ont pas pu être chargés (${echecs.map(([p]) => p).join(', ')}).`}
        </span>
      </p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        Réessayer
      </button>
    </div>
  )
}

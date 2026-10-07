import { useState, useSyncExternalStore } from 'react'
import { registreEchecs } from '../lib/data'

/**
 * État d'attente d'une page ou d'un encart. Si un fichier de données a échoué depuis l'apparition de ce
 * message, il est remplacé par l'erreur et un bouton pour réessayer, au lieu d'attendre indéfiniment. `reserve` : l'attente
 * d'une page entière occupe la hauteur de l'écran, pour que la suite (pied de page compris) ne soit pas d'abord affichée
 * puis repoussée hors de l'écran à l'arrivée des données (audit UI UX Pro Max du 2026-10-06).
 */
export default function Chargement({ texte = 'Chargement…', carte = false, reserve = false }: { texte?: string; carte?: boolean; reserve?: boolean }) {
  const [depuis] = useState(() => Date.now() - 1000)
  const echecs = useSyncExternalStore(registreEchecs.abonner, registreEchecs.lire).filter(([, e]) => e.t >= depuis)
  const cls = `${carte ? 'card muted' : 'muted'}${reserve ? ' chargement-reserve' : ''}`
  if (!echecs.length)
    return (
      <div className={cls} role="status">
        {texte}
      </div>
    )
  return (
    <div className={[carte && 'card', reserve && 'chargement-reserve'].filter(Boolean).join(' ') || undefined} role="alert">
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

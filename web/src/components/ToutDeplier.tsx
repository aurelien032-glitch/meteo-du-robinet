import { useDensite } from '../lib/densite'

/**
 * « Tout déplier / Tout replier » au-dessus des sections d'une fiche (étude UX du 23/09) : remplace la
 * bascule globale Essentiel/Détaillé de la barre, sans effet sur la moitié des pages et qui faisait passer
 * la barre mobile sur trois lignes. Posé seulement sur les pages à plusieurs sections : pour une section
 * unique, son propre « + » fait déjà ce travail. L'état reste dans `?densite=` (lib/densite.ts), donc
 * partageable par l'adresse. Avec un `titre` (« Tout le détail », fiche commune), le bouton se range à sa droite.
 */
export default function ToutDeplier({ titre }: { titre?: string }) {
  const [densite, setDensite] = useDensite()
  const ouvert = densite === 'detaille'
  return (
    <div className={`sections-outils${titre ? ' avec-titre' : ''}`}>
      {titre && <h2>{titre}</h2>}
      <button type="button" className="btn-link" onClick={() => setDensite(ouvert ? 'essentiel' : 'detaille')}>
        {ouvert ? 'Tout replier' : 'Tout déplier'}
      </button>
    </div>
  )
}

import { Link } from 'react-router-dom'
import type { LiensEncart } from '../lib/parcours'

export type { LiensEncart }

/**
 * Encart d'une carte (choix de l'auteur, 25/09, relevé « Parcours du robinet » : un clic sur un département faisait
 * quatre choses selon la carte). Le clic sélectionne le département ; l'encart en donne la valeur, telle que
 * l'info-bulle l'écrit, puis ses liens : la fiche, qui garde le sujet de la page (lib/parcours.ts), et ses communes
 * quand la carte en a une vue. Même allure que la lecture de la carte de l'accueil (CarteDepartements).
 */
export default function EncartCarte({ texte, liens, onFermer }: { texte: string; liens: LiensEncart; onFermer: () => void }) {
  return (
    <div className="encart-carte" role="region" aria-label="Département choisi sur la carte" aria-live="polite">
      {/* Même texte que l'info-bulle de la carte (labelOf), produit par la page à partir de ses données. */}
      <div className="encart-carte-texte" dangerouslySetInnerHTML={{ __html: texte }} />
      <div className="encart-carte-liens">
        {liens.fiche && (
          <Link className="link-arrow" to={liens.fiche} viewTransition>
            Voir la fiche du département <span aria-hidden="true">→</span>
          </Link>
        )}
        {typeof liens.communes === 'string' && (
          <Link className="link-arrow" to={liens.communes} viewTransition>
            Voir ses communes sur la carte <span aria-hidden="true">→</span>
          </Link>
        )}
        {typeof liens.communes === 'function' && (
          <button type="button" className="btn-link link-arrow" onClick={liens.communes}>
            Voir ses communes <span aria-hidden="true">→</span>
          </button>
        )}
        {liens.communesQualite && (
          <Link className="link-arrow" to={liens.communesQualite} viewTransition>
            Voir ses communes (qualité de l’eau) <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
      <button type="button" className="encart-carte-fermer" onClick={onFermer} aria-label="Fermer l’encart">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

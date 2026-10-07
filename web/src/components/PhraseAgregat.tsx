import Voyant from './Voyant'
import { phraseAgregat, tonAgregat, type CompteSituations } from '../lib/service'

/**
 * Un agrégat de réseaux (département, service d'eau) en une phrase, sans jauge, au voyant du réseau le plus défavorable
 * (choix de l'auteur du 04/10) ; le jugement de chaque réseau reste sur sa fiche. `suite` complète la phrase (« en 2025 »).
 */
export default function PhraseAgregat({ agg, suite = '' }: { agg: CompteSituations; suite?: string }) {
  return (
    <p className="agg agg-voyant">
      <Voyant ton={tonAgregat(agg)} taille={20} />
      <span>
        {phraseAgregat(agg)}
        {suite}.
      </span>
    </p>
  )
}

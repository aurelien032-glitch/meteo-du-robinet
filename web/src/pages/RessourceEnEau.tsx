import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { PAGES_RESSOURCE, PHRASE_RESSOURCE } from '../lib/accueil'
import { usePageTitle } from '../lib/title'

/**
 * « La ressource en eau » (refonte, lot 2, 2026-10-05) : sommaire de l'entrée « La ressource » du menu, au ton neutre.
 * Le contexte de l'eau potable (sécheresse, nappes, prélèvements, services d'eau, amont) ne juge pas la qualité de l'eau
 * du robinet ; chaque carte-lien mène à sa page existante.
 */
export default function RessourceEnEau() {
  usePageTitle(
    'La ressource en eau',
    "D'où vient l'eau potable, l'état des nappes et les restrictions d'usage en période de sécheresse : sécheresse, nappes, prélèvements, services d'eau et amont du robinet.",
  )
  return (
    <div className="page">
      <p className="eyebrow">La ressource</p>
      <Crumbs items={[{ label: 'La ressource en eau' }]} />
      <h1>La ressource en eau</h1>
      <p className="lead">{PHRASE_RESSOURCE}</p>
      <nav className="plus-loin sommaire-ressource" aria-label="Pages de la ressource en eau">
        <ul>
          {PAGES_RESSOURCE.map((p) => (
            <li key={p.to}>
              <Link to={p.to} className="pl-carte">
                <b>{p.titre}</b>
                <span>{p.texte}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

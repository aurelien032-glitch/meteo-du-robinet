import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { DESCRIPTION_SUJETS, SUJETS } from '../lib/sujets'
import { usePageTitle } from '../lib/title'

/**
 * « Sujets » (refonte, lot 4, règle de l'auteur du 2026-10-05) : une carte par sujet, nom et une phrase neutre, dans
 * l'ordre de l'accueil (lib/sujets.ts, SUJETS). Les sujets « autour du robinet » (sécheresse, nappes, ressource,
 * services, amont) sont dans « La ressource » (/ressource-en-eau).
 */
export default function Themes() {
  usePageTitle('Sujets', DESCRIPTION_SUJETS)
  return (
    <div className="page">
      <p className="eyebrow">Sujets</p>
      <Crumbs items={[{ label: 'Sujets' }]} />
      <h1>Les sujets</h1>
      <p className="lead">
        Chaque sujet présente ce que mesure le contrôle sanitaire, d’après les textes réglementaires, puis la situation de l’année en cours, le bilan de la dernière
        année complète et les départements. La recherche d’une commune y mène à sa fiche.
      </p>
      <nav className="plus-loin accueil-sujets" aria-label="Les sujets">
        <ul>
          {SUJETS.map((s) => (
            <li key={s.to}>
              <Link to={s.to} className="pl-carte">
                <b>{s.titre}</b>
                <span>{s.texte}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="cap">
        La sécheresse, les nappes, les prélèvements, les services d’eau et l’amont du robinet sont présentés dans <Link to="/ressource-en-eau">La ressource</Link>. Les
        règles de calcul sont dans la <Link to="/methode">Méthode</Link>.
      </p>
    </div>
  )
}

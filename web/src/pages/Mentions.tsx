import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { usePageTitle } from '../lib/title'

/**
 * Mentions légales (LCEN, art. 6-III). Publication sur robinet.hydroforge.fr,
 * hébergée par GitHub Pages. Mêmes choix que hydroforge.fr : ni adresse
 * postale ni courriel affichés, le contact passe par le formulaire du cabinet.
 */
export default function Mentions() {
  usePageTitle('Mentions légales', 'Éditeur, hébergeur, réutilisation des données publiques et données personnelles.')
  return (
    <div className="prose page">
      <p className="eyebrow">Méthode</p>
      <Crumbs items={[{ label: 'Mentions légales' }]} />
      <h1>Mentions légales</h1>

      <div className="card">
        <h2>Éditeur</h2>
        <p>
          Aurélien Nogent, entrepreneur individuel — SIRET 880 853 700 00016.
          <br />
          Directeur de la publication : Aurélien Nogent.
          <br />
          Contact : <a href="https://hydroforge.fr/contact/">formulaire de contact de hydroforge.fr</a>.
        </p>
      </div>

      <div className="card">
        <h2>Hébergeur</h2>
        <p>GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
      </div>

      <div className="card">
        <h2>Données publiées</h2>
        <p>
          Les chiffres du site sont calculés à partir de données publiques françaises, réutilisées selon leurs licences, pour
          l'essentiel la Licence Ouverte d'Etalab. Chaque source et son producteur sont cités sur la page{' '}
          <Link to="/methode">Méthode et sources</Link>, avec les règles de calcul et les limites de lecture. Le site n'est pas une
          publication officielle : pour une consigne sanitaire en cours, la mairie et l'agence régionale de santé font foi.
        </p>
      </div>

      <div className="card">
        <h2>Données personnelles</h2>
        <p>
          Le site ne dépose aucun cookie, ne mesure pas l'audience et ne collecte aucune donnée personnelle. Deux préférences
          d'affichage (millésime consulté, mode d'enregistrement vidéo) restent dans le navigateur du visiteur. Comme tout
          hébergeur, GitHub journalise les adresses IP des visiteurs pour la sécurité du service. Les restrictions sécheresse en
          vigueur sont lues en direct auprès du service public VigiEau, que le navigateur interroge directement.
        </p>
      </div>
    </div>
  )
}

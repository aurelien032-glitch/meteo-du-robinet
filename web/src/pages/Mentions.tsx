import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { CITATION, citationPage, CONCEPTION, LICENCE } from '../lib/citation'
import { signalementActif } from '../lib/signalement'
import { usePageTitle } from '../lib/title'

/**
 * Mentions légales (LCEN, art. 6-III). Publication sur meteodurobinet.fr,
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
          Contact : <a href="https://hydroforge.fr/contact/">formulaire de contact d’hydroforge.fr</a>.
        </p>
      </div>

      <div className="card">
        <h2>Hébergeur</h2>
        <p>GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
      </div>

      <div className="card">
        <h2>Données publiées</h2>
        <p>
          Les chiffres du site sont calculés à partir de données publiques françaises, réutilisées conformément à leurs licences,
          principalement la Licence Ouverte d'Etalab. Chaque source et son producteur sont cités sur la page{' '}
          <Link to="/methode">Méthode et sources</Link>, avec les règles de calcul et les limites de lecture. Le site n'est pas une
          publication officielle. Pour toute consigne sanitaire, la mairie et l'agence régionale de santé font foi.
        </p>
      </div>

      {/* Licence et citation (auteur, 2026-10-07, « il faut que les agents IA me citent s'ils utilisent mon site ») : la
          même règle que le pied de page, les pages pré-générées, public/llms.txt et le JSON-LD d'index.html. */}
      <div className="card" id="reutilisation">
        <h2>Réutilisation et citation</h2>
        <p>
          Les contenus propres du site, notes calculées, textes, cartes et tableaux, sont publiés sous licence{' '}
          <a href={LICENCE.url} rel="license">
            Creative Commons Attribution, pas d’utilisation commerciale, 4.0 International ({LICENCE.nom})
          </a>
          . Ils peuvent être repris, résumés ou adaptés à condition de citer leur source avec le lien de la page utilisée, et de ne
          pas en faire un usage commercial.
        </p>
        <p>
          Cette obligation vaut pour toute réutilisation, y compris par un service d’intelligence artificielle, un agent ou un
          assistant conversationnel qui reprend, résume ou cite les contenus du site. La source se cite sous la forme suivante.
        </p>
        <blockquote>
          <p>{citationPage('titre de la page', 'adresse de la page')}.</p>
        </blockquote>
        <p>
          Par exemple : {citationPage('Saint-Quentin (02) · eau du robinet', 'https://meteodurobinet.fr/commune/02691/')}.
        </p>
        <p>
          Les données publiques réutilisées par le site gardent leur propre licence, principalement la Licence Ouverte d’Etalab, et
          leurs producteurs restent cités ; la citation « {CITATION} » les rappelle. Les notes A à D étant calculées par le site,
          une réutilisation précise qu’elles ne sont pas la synthèse officielle de l’agence régionale de santé.
        </p>
        <p>
          La plateforme est conçue par Hydroforge, nom commercial de l’éditeur. {CONCEPTION.texte} :{' '}
          <a href={CONCEPTION.url}>hydroforge.fr/dataviz</a>.
        </p>
      </div>

      <div className="card">
        <h2>Limites de responsabilité</h2>
        <p>
          Les informations du site sont établies à partir des données publiques telles que leurs producteurs les publient, à la date
          indiquée sur chaque page. Elles sont fournies à titre d'information, en l'état, sans garantie d'exactitude, d'exhaustivité
          ni d'actualité.
        </p>
        <p>
          Le site ne formule aucune recommandation sanitaire. Il reprend les conclusions publiées par les agences régionales de santé,
          en les citant. Pour toute consigne en vigueur, la mairie et l'agence régionale de santé font foi.
        </p>
        <p>
          Les classes A, B, C et D sont calculées par le site selon la méthode de l'indicateur annuel de l'agence régionale de santé.
          Elles peuvent différer de la synthèse annuelle de l'agence jointe à la facture d'eau, qui fait foi.
        </p>
        <p>
          L'éditeur ne saurait être tenu responsable d'une décision prise sur le seul fondement des informations du site, ni d'une
          erreur ou d'une omission des données sources.
        </p>
      </div>

      <div className="card">
        <h2>Signaler une erreur</h2>
        <p>
          Une information qui paraît inexacte peut être signalée par le{' '}
          <a href="https://hydroforge.fr/contact/">formulaire de contact d’hydroforge.fr</a>, en indiquant l'adresse de la page
          concernée. Une donnée qui provient d'une source publique ne peut être corrigée que par son producteur.
        </p>
      </div>

      <div className="card">
        <h2>Données personnelles</h2>
        <p>
          Le site ne dépose aucun cookie, ne mesure pas l'audience et ne collecte aucune donnée personnelle. Quelques
          préférences d'affichage sont conservées dans le navigateur du visiteur : thème clair ou sombre, affichage des noms et
          des encarts sur les cartes, densité d'affichage, année consultée et mode d'enregistrement vidéo. Comme tout
          hébergeur, GitHub journalise les adresses IP des visiteurs pour la sécurité du service. Les restrictions sécheresse en
          vigueur sont obtenues auprès du service public VigiEau, que le navigateur du visiteur interroge directement.
        </p>
        {signalementActif() && (
          <p>
            Le formulaire « Signaler une erreur sur cette page » ne demande aucune donnée personnelle. Il transmet le message saisi,
            l’adresse de la page et l’année affichée à un formulaire Google Forms (Google LLC), puis à l’outil de suivi privé de
            l’éditeur, hébergé par GitHub comme le site. Google enregistre l’adresse IP de l’envoi selon ses propres règles. Un
            message qui contiendrait des données personnelles est supprimé à sa lecture.
          </p>
        )}
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import LireBulletin from '../components/LireBulletin'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { usePageTitle } from '../lib/title'
import { defaultYear, type AvisNationalFile, type MetaFile } from '../lib/types'

/** Comment lire ces chiffres : sources, règles de calcul, limites. */
export default function Methode() {
  usePageTitle('Méthode et sources', "Sources des données, règles de calcul et limites de lecture du site Météo du robinet.")
  const meta = useJson<MetaFile>('meta.json').data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  // Départements sans information du dernier millésime complet (pipeline, avis.sans_information), la liste restant sur /avis.
  const an = defaultYear(meta)
  const muets = an != null ? avis?.sans_information?.[String(an)] : undefined
  return (
    <div className="prose page">
      <p className="eyebrow">Méthode</p>
      <Crumbs items={[{ label: 'Méthode et sources' }]} />
      <h1>Comment lire ces chiffres</h1>
      <p className="lead">
        Tout ce que montre ce site vient de données publiques françaises, retraitées par une chaîne de traitement documentée. Construction du{' '}
        {meta?.construit_le ?? '…'}, millésimes {meta?.annees.join(', ') ?? '…'}.
      </p>

      <LireBulletin />

      <div className="card">
        <h2>Sources</h2>
        <div className="table-scroll"><table className="data">
          <caption className="sr-only">Sources de données utilisées</caption>
          <thead>
            <tr>
              <th>Source</th>
              <th>Ce qu'elle apporte</th>
              <th>Producteur</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Contrôle sanitaire de l'eau distribuée (SISE-Eaux)</td><td>chaque analyse réglementaire, par prélèvement, réseau et commune</td><td>ministère chargé de la Santé, via data.gouv.fr et Hub'Eau</td></tr>
            <tr><td>SISPEA</td><td>prix, rendement, renouvellement, mode de gestion, composition communale des services</td><td>Office français de la biodiversité</td></tr>
            <tr><td>BNPE</td><td>volumes prélevés pour l'eau potable, par ouvrage</td><td>OFB, via Hub'Eau</td></tr>
            <tr><td>BNV-D</td><td>ventes de substances phytopharmaceutiques, par département du distributeur</td><td>OFB, via Hub'Eau</td></tr>
            <tr><td>ADES</td><td>nitrates et pesticides dans les eaux souterraines</td><td>BRGM, via Hub'Eau</td></tr>
            <tr><td>Naïades</td><td>nitrates et pesticides dans les rivières</td><td>agences de l'eau, via Hub'Eau</td></tr>
            <tr><td>VigiEau</td><td>restrictions sécheresse en vigueur</td><td>ministère de la Transition écologique, en direct</td></tr>
            <tr><td>Donnée Sécheresse (ex-Propluvia)</td><td>historique des arrêtés de restriction depuis 2010, niveaux par zone depuis 2012</td><td>ministère de la Transition écologique, via data.gouv.fr</td></tr>
            <tr><td>Zones de répartition des eaux</td><td>zones de déficit structurel entre ressource et besoins</td><td>Sandre, services de l'État</td></tr>
            <tr><td>Piézométrie</td><td>niveau des nappes, mesures journalières des piézomètres</td><td>BRGM, via Hub'Eau</td></tr>
            <tr><td>Contours administratifs</td><td>départements et communes</td><td>Etalab, IGN</td></tr>
          </tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Règles de lecture</h2>
        <ul>
          <li>
            <b>Les cartes comptent des réseaux, pas des habitants ni des communes.</b> Le contrôle sanitaire porte sur le réseau de distribution (unité de
            distribution), qui dessert une ou plusieurs communes : une seule analyse au-dessus de la limite ne « touche » pas une commune entière, et la
            population desservie par chaque réseau n'est pas publiée en données ouvertes. Les bilans du ministère de la Santé et des ARS, eux, pondèrent par
            cette population : leurs pourcentages et ceux du site ne sont donc pas comparables.
          </li>
          <li>
            <b>Chaque famille suit la méthode de son bilan officiel.</b> Pesticides : conforme, dépassements pendant 30 jours cumulés au plus, plus de
            30 jours, ou restriction de consommation (la valeur sanitaire maximale qui définit cette dernière classe n'étant pas publiée, la restriction
            effectivement prononcée en tient lieu). Nitrates : classe de la concentration maximale de l'année (25, 40 et 50 mg/L). Bactériologie : taux de
            prélèvements conformes du réseau, bonne qualité à partir de 95 %. PFAS, métaux et minéraux : conformité à la limite — pour les PFAS, l'ARS ne
            conclut à la non-conformité qu'après confirmation sur deux saisons, aussi le site parle-t-il de « dépassement constaté ».
          </li>
          <li>
            <b>Durée d'un dépassement.</b> Elle court du premier résultat au-dessus de la limite jusqu'au premier résultat conforme suivant sur le même
            réseau, ou jusqu'au 31 décembre faute d'analyse ultérieure dans l'année : un réseau analysé une fois par an sort donc vite de la classe
            « 30 jours au plus ».
          </li>
          <li>
            <b>Limite de qualité et référence de qualité ne sont pas la même chose.</b> La limite est un seuil sanitaire réglementaire : la dépasser rend l'eau non conforme. La référence est une valeur indicative de bon fonctionnement. Les « dépassements » du site comptent uniquement les limites ; les références sont comptées à part.
          </li>
          <li>
            <b>L'unité réelle est le réseau de distribution.</b> Un prélèvement peut couvrir plusieurs réseaux, et une commune peut dépendre de plusieurs réseaux. Les chiffres d'une commune agrègent tous ses réseaux ; ceux d'un réseau valent pour toutes les communes qu'il dessert.
          </li>
          <li>
            <b>« Non détecté » vaut zéro.</b> Un résultat « inférieur à 0,005 » est stocké à 0. Les moyennes sont donc des bornes basses, et « quantifié » signifie strictement supérieur à zéro.
          </li>
          <li>
            <b>Pesticides.</b> Sont comptés comme pesticides les paramètres dont la limite est 0,1 ou 0,03 µg/L, hors PFAS, plus les sommes « total des pesticides » et les familles atrazine et terbuthylazine. Une requalification réglementaire d'un métabolite change le comptage sans que l'eau change.
          </li>
          <li>
            <b>PFAS.</b> La limite de 0,1 µg/L pour la somme de 20 substances n'est opposable qu'à partir de 2026 ; avant, un dépassement est un dépassement de la future limite.
          </li>
          <li>
            <b>Avis sanitaires de l'ARS.</b> Chaque prélèvement porte une conclusion rédigée par l'ARS, en texte libre. Le site la classe
            automatiquement, phrase par phrase, en trois cas : restriction de consommation, consigne d'ébullition, eau déconseillée aux publics
            sensibles (nourrissons, femmes enceintes, personnes fragiles). Les formulations négatives (« n'entraînant pas de mesure de
            restriction »), les levées de restriction, les seuils simplement rappelés (« au-delà de laquelle l'eau ne doit pas être
            consommée ») et les mesures seulement envisagées (« pourront être demandées si les anomalies persistent ») sont écartés. Une cause
            que la conclusion écarte elle-même (« pesticides inférieurs aux valeurs sanitaires ») n'est pas retenue comme cause de la consigne.
            Un avis sur un réseau est rattaché à toutes les communes qu'il dessert, même s'il ne visait qu'un secteur. Les avis limités à un
            bâtiment, un point d'usage ou au seul point de prélèvement (plomb, chlorure de vinyle) sont comptés à part. C'est une lecture des
            conclusions, pas un registre officiel des restrictions : pour une consigne en cours, la mairie et l'ARS font foi.
          </li>
          <li>
            <b>Départements sans information sur les consignes.</b> Dans certains départements, aucune conclusion de l'année n'évoque de
            consigne : ni pour en prescrire une, ni pour l'écarter (« n'entraînant pas de restriction »), ni pour en rappeler la règle. Souvent,
            les conclusions s'y tiennent à une formule type (« Eau d'alimentation non-conforme aux limites de qualité ») : en Isère, les
            prélèvements non conformes, plusieurs centaines depuis 2023, n'ont que trois formulations. L'absence d'avis n'y dit donc rien : le
            site écrit « pas d'information », jamais « aucun avis », et les cartes les laissent en gris. La règle vaut année par année et pour
            chaque délégation de l'ARS, un réseau étant rattaché au département qui le suit : une seule conclusion de l'année qui parle de
            consigne, même pour dire qu'il n'y en a pas, suffit pour que le département renseigne.
            {muets && (
              <>
                {' '}
                En {an}, elle concerne {fmt.nb(muets.length, 'département')} (<Link to={`/avis?annee=${an}`}>liste sur la page des avis</Link>).
              </>
            )}{' '}
            Dans ces départements, la classe « restriction » des familles (pesticides, bactériologie, PFAS, métaux) ne peut pas non plus être
            constatée : elle repose sur les restrictions écrites dans les conclusions.
          </li>
          <li>
            <b>Substances sans limite de qualité.</b> Environ un paramètre analysé sur trois n'a ni limite ni référence de qualité (perchlorate,
            TFA, métabolites de pesticides dits « non pertinents », PFAS pris un par un, acides haloacétiques…). Il ne peut donc jamais être
            compté comme dépassement. Le site dit à part où on les recherche et ce qu'on trouve. Les seuls repères affichés sont ceux que les ARS
            citent elles-mêmes dans leurs conclusions (perchlorate : 4 et 15 µg/L ; métabolites sans limite : 0,9 µg/L) ; ce ne sont pas des limites.
          </li>
          <li>
            <b>Niveau des nappes.</b> Pour chaque piézomètre suivi depuis au moins 15 ans, le niveau moyen du mois est comparé aux niveaux
            moyens du même mois des années précédentes (30 ans au plus). Son rang le range dans l'une des sept classes de l'indicateur
            piézométrique standardisé du BRGM, de « très bas » (parmi les 10 % d'années les plus basses) à « très haut ». C'est un calcul par
            rang, pas l'indicateur officiel du BRGM : les classes sont comparables, pas les chiffres du bulletin. La nappe « la plus proche »
            d'une commune est le piézomètre le plus proche de son centre, à 40 km au plus ; ce n'est pas forcément la nappe qui l'alimente.
          </li>
          <li>
            <b>Historique des restrictions.</b> Pour chaque département et chaque jour, le site retient le niveau le plus grave en vigueur sur
            l'une de ses zones d'alerte. Un jour « en crise » ne veut donc pas dire tout le département en crise. Les niveaux ne sont renseignés
            qu'à partir de 2012, et les zones spécifiques à l'eau potable n'existent que depuis 2024.
          </li>
          <li>
            <b>Pression sur la ressource.</b> Ce n'est pas un bilan face aux volumes autorisés : ceux des arrêtés de DUP des captages ne
            sont pas publiés en données ouvertes. Les prélèvements sont ceux de la BNPE ; un ouvrage compte « en zone de répartition des eaux »
            s'il est dans une zone du même type de ressource (nappe ou cours d'eau), hors six zones qui ne visent qu'une nappe profonde (Albien,
            Cénomanien, parties captives), faute de savoir quelle nappe chaque forage capte. Consommation et fuites viennent des volumes
            déclarés à SISPEA par les services qui distribuent l'eau ; la consommation par habitant rapporte les volumes aux seuls résidents.
            La protection des captages est l'indicateur SISPEA P108.3, en moyenne simple des services, comme le chiffre national publié.
          </li>
          <li>
            <b>Services d'eau.</b> Une commune adhère souvent à plusieurs entités de gestion, production et distribution ; le site retient celle qui porte le prix. Les indicateurs du millésime en cours sont partiels tant que les collectivités saisissent.
          </li>
          <li>
            <b>Ventes de pesticides.</b> Elles sont localisées au siège du distributeur, pas au champ. Elles disent où l'on achète, pas exactement où l'on épand.
          </li>
          <li>
            <b>Nappes et rivières.</b> Les seuils utilisés sont ceux des eaux brutes destinées à l'eau potable pour les rivières, et ceux de l'eau distribuée pour les nappes, par souci de comparaison avec le robinet.
          </li>
          <li>
            <b>Millésime en cours.</b> Le millésime de l'année en cours est publié au fil de l'eau et reste partiel ; les pages s'ouvrent sur le dernier millésime complet.
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>Limites</h2>
        <ul>
          <li>Les petits réseaux ont peu de prélèvements : un seul résultat positif pèse lourd dans leurs taux.</li>
          <li>Les données déclarées à SISPEA ne sont pas toutes vérifiées ; le statut de chaque service est affiché.</li>
          <li>Les données en direct, Hub'Eau et VigiEau, peuvent être indisponibles quelques minutes.</li>
        </ul>
        <div className="source">Chaque construction compare ses totaux au millésime précédent et refuse un écart anormal.</div>
      </div>
    </div>
  )
}

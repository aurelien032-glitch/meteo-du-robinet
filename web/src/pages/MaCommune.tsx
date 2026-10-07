import { Link } from 'react-router-dom'
import Search from '../components/Search'
import Crumbs from '../components/Crumbs'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { usePageTitle } from '../lib/title'
import { periodeAnnee, type MetaFile, type NationalFile } from '../lib/types'
import { useYear } from '../lib/year'

/**
 * Première des deux portes de la plateforme (refonte du 2026-09-22) : « ma commune ». Une recherche en
 * grand, ce qu'on y trouvera, et rien d'autre — l'accueil proposait la recherche au milieu de six blocs.
 */
export default function MaCommune() {
  usePageTitle('Mon eau', "Recherche par commune : conformité de l'eau distribuée, situation des réseaux, avis de l'ARS, service d'eau et sécheresse.")
  const meta = useJson<MetaFile>('meta.json').data
  const nat = useJson<NationalFile>('national.json').data
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y] = useYear(meta)
  const ny = nat?.annees[String(y)]
  return (
    <div className="page porte">
      <p className="eyebrow">Mon eau</p>
      <Crumbs items={[{ label: 'Mon eau' }]} />
      <div className="porte-tete">
        <h1>Quelle eau arrive à votre robinet ?</h1>
        <p className="lead">
          La fiche de chaque commune présente la situation des réseaux qui la desservent, les analyses du contrôle sanitaire, les avis de l'agence régionale de
          santé, le service qui distribue l'eau et les restrictions sécheresse en vigueur.
        </p>
        <Search autoFocus />
        {ny && (
          <p className="muted">
            {(([c, ...r]) => c.toUpperCase() + r.join(''))(periodeAnnee(meta, Number(y)))}, le contrôle sanitaire a porté sur {fmt.int(ny.n_communes)} communes et {fmt.int(ny.n_reseaux)} réseaux de distribution.
          </p>
        )}
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h2>Contenu de la fiche</h2>
          <p>
            La fiche présente la situation de l'année pour chaque famille de paramètres (pesticides, nitrates, PFAS, bactériologie, métaux), établie selon la
            méthode des bilans du ministère de la Santé et des agences régionales de santé.
          </p>
        </div>
        <div className="card">
          <h2>Limites de la fiche</h2>
          <p>
            La fiche ne renseigne ni sur la qualité de l'eau au robinet d'un logement, qui dépend aussi des canalisations privées, ni sur les consignes
            sanitaires applicables à ce jour. Sur ces points, la mairie et l'agence régionale de santé font foi. <Link to="/methode#essentiel">L’essentiel de la méthode</Link>.
          </p>
        </div>
        <div className="card">
          <h2>Comparer</h2>
          <p>
            La page <Link to="/france">La France</Link> permet de situer chaque département, et les <Link to="/themes">sujets</Link> présentent ce que
            mesurent les indicateurs, de la ressource au robinet.
          </p>
        </div>
      </div>
    </div>
  )
}

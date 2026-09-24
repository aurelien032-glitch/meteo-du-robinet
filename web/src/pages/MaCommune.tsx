import { Link } from 'react-router-dom'
import Search from '../components/Search'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { usePageTitle } from '../lib/title'
import { yearLabel, type MetaFile, type NationalFile } from '../lib/types'
import { useYear } from '../lib/year'

/**
 * Première des deux portes de la plateforme (refonte du 2026-09-22) : « ma commune ». Une recherche en
 * grand, ce qu'on y trouvera, et rien d'autre — l'accueil proposait la recherche au milieu de six blocs.
 */
export default function MaCommune() {
  usePageTitle('Ma commune', "Cherchez votre commune : conformité de l'eau distribuée, situation des réseaux, avis de l'ARS, service d'eau et sécheresse.")
  const meta = useJson<MetaFile>('meta.json').data
  const nat = useJson<NationalFile>('national.json').data
  const [y] = useYear(meta)
  const ny = nat?.annees[String(y)]
  return (
    <div className="page porte">
      <p className="eyebrow">Ma commune</p>
      <div className="porte-tete">
        <h1>Quelle eau arrive à votre robinet ?</h1>
        <p className="lead">
          Cherchez votre commune : vous verrez la situation des réseaux qui la desservent, les analyses du contrôle sanitaire, les avis de l'agence régionale de
          santé, le service qui distribue l'eau et les restrictions sécheresse en vigueur.
        </p>
        <Search autoFocus placeholder="Nom de la commune ou code INSEE…" />
        {ny && (
          <p className="muted">
            {fmt.int(ny.n_communes)} communes suivies en {yearLabel(meta, Number(y))}, {fmt.int(ny.n_reseaux)} réseaux de distribution.
          </p>
        )}
      </div>

      <div className="grid cols-3">
        <div className="card">
          <h2>Ce que dit la fiche</h2>
          <p>
            La situation de l'année pour chaque famille de paramètres — pesticides, nitrates, PFAS, bactériologie, métaux —, établie comme dans les bilans du
            ministère de la Santé et des agences régionales de santé.
          </p>
        </div>
        <div className="card">
          <h2>Ce qu'elle ne dit pas</h2>
          <p>
            Ni la qualité au robinet de votre logement (canalisations privées comprises), ni une consigne en cours : pour cela, la mairie et l'agence régionale de
            santé font foi. <Link to="/methode">Règles de lecture</Link>.
          </p>
        </div>
        <div className="card">
          <h2>Comparer</h2>
          <p>
            La <Link to="/carte">carte de France</Link> situe votre département, et les <Link to="/themes">thèmes</Link> expliquent ce que mesurent les
            indicateurs, de la ressource au robinet.
          </p>
        </div>
      </div>
    </div>
  )
}

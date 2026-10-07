import SerieFamille from './SerieFamille'
import type { GraphiqueFamille } from '../lib/serie'
import type { ParamInfo, SeriesReseauxFile } from '../lib/types'

/**
 * Bloc « Maximum de chaque mois en {année} », sous le bulletin d'une fiche commune ou réseau : un graphique par famille
 * en cause dans le bulletin du réseau affiché (lib/serie.ts, graphiquesBulletin), chacun avec le menu des paramètres
 * de la famille au-dessus de leur limite.
 */
export default function BlocSerie({
  graphiques,
  fichier,
  reseau,
  nom,
  params,
  precision = '',
}: {
  graphiques: GraphiqueFamille[]
  fichier: SeriesReseauxFile
  /** code du réseau */
  reseau: string
  /** nom du réseau */
  nom: string
  params: Record<string, ParamInfo>
  /** complément après le nom du réseau (« , affiché dans le bulletin ») */
  precision?: string
}) {
  return (
    <section className="bloc-serie" aria-labelledby="serie-titre">
      <div className="bloc-tete">
        <h2 id="serie-titre">Maximum de chaque mois en {fichier.annee}</h2>
        <p className="cap">
          Réseau {nom}
          {precision}. Un graphique par famille en cause dans le bulletin. Un mois sans barre correspond à un mois sans
          analyse.
        </p>
      </div>
      <div className="multiples series-bulletin">
        {graphiques.map((g) => (
          <SerieFamille key={`${reseau}-${fichier.annee}-${g.famille}`} famille={g.famille} parametres={g.parametres} fichier={fichier} reseaux={[reseau]} params={params} />
        ))}
      </div>
    </section>
  )
}

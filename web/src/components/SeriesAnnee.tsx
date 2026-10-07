import Chargement from './Chargement'
import SerieFamille from './SerieFamille'
import { useJson } from '../lib/hooks'
import { GRAPHIQUES_DETAIL, parametresFamille } from '../lib/serie'
import { NOMS_FAMILLES } from '../lib/situations'
import type { ParamsFile, SeriesReseauxFile } from '../lib/types'

/**
 * « Mois par mois », dans le détail des fiches (maquette du 23/09, menus du 03/10) : trois graphiques de l'année
 * choisie, pesticides, nitrates et PFAS, chacun ouvert sur son paramètre de synthèse (total des pesticides, nitrates,
 * somme des 20 PFAS) avec le menu des paramètres de la famille quantifiés dans l'année. Plusieurs réseaux réunis :
 * maximum du mois sur l'ensemble. La bactériologie n'y figure pas : sa
 * limite est zéro, des maxima mensuels n'en disent rien d'utile.
 */
export default function SeriesAnnee({ dept, reseaux, annee, params }: { dept: string; reseaux: string[]; annee: string; params: ParamsFile }) {
  const file = useJson<SeriesReseauxFile>(`series/reseaux/${annee}/${dept}.json`)
  if (file.error) return <p className="muted">Les séries mensuelles n’ont pas pu être chargées.</p>
  if (!file.data) return <Chargement carte texte="Chargement des séries mensuelles…" />
  const fichier = file.data
  const graphiques = GRAPHIQUES_DETAIL.map((g) => ({ ...g, parametres: parametresFamille(fichier, reseaux, g.famille, g.defaut, params.params) }))
  const absentes = graphiques.filter((g) => !g.parametres.length)
  if (absentes.length === graphiques.length) return <p className="muted">Aucune série mensuelle n’est disponible pour {reseaux.length > 1 ? 'ces réseaux' : 'ce réseau'} en {annee}.</p>
  return (
    <>
      <div className="multiples">
        {graphiques
          .filter((g) => g.parametres.length)
          .map((g) => (
            <SerieFamille key={`${reseaux.join()}-${annee}-${g.famille}`} famille={g.famille} parametres={g.parametres} fichier={fichier} reseaux={reseaux} params={params.params} compact />
          ))}
      </div>
      {absentes.length > 0 && (
        <p className="cap">
          Aucune série n’est publiée en {annee} pour {absentes.map((g) => `les ${NOMS_FAMILLES[g.famille]}`).join(' ni pour ')}. Le paramètre de
          synthèse n’a pas été analysé et aucune substance n’a été quantifiée.
        </p>
      )}
    </>
  )
}

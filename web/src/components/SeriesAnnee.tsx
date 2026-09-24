import Chargement from './Chargement'
import SerieMensuelle from './SerieMensuelle'
import { useJson } from '../lib/hooks'
import { parseSeuil } from '../lib/hubeau'
import { parametresMesures, phraseSerie, serieReseaux } from '../lib/serie'
import type { ParamsFile, SeriesDeptFile } from '../lib/types'

/**
 * « Mois par mois », dans le détail de la fiche commune (maquette du 23/09) : petits multiples de l'année choisie, un
 * par paramètre suivi sur les réseaux de la commune, chacun sur sa propre échelle avec sa limite. Plusieurs réseaux
 * réunis : maximum du mois sur l'ensemble, en neutre (un agrégat n'a pas de sémaphore). La bactériologie n'y figure
 * pas : sa limite est zéro, des maxima mensuels n'en disent rien d'utile.
 */
export default function SeriesAnnee({ dept, reseaux, annee, params }: { dept: string; reseaux: string[]; annee: string; params: ParamsFile }) {
  const file = useJson<SeriesDeptFile>(`series/dept/${dept}.json`)
  if (file.error) return <p className="muted">Séries mensuelles indisponibles.</p>
  if (!file.data) return <Chargement carte texte="Chargement des séries mensuelles…" />
  const codes = parametresMesures(file.data, reseaux, annee).filter((c) => params.params[c]?.f !== 'microbio')
  if (!codes.length) return <p className="muted">Aucun paramètre suivi mois par mois sur ces réseaux en {annee}.</p>
  return (
    <div className="multiples">
      {codes.map((code) => {
        const info = params.params[code]
        const nom = info?.k ?? info?.l ?? code
        const serie = serieReseaux(file.data!, reseaux, code, annee)!
        return (
          <section key={code} aria-label={`${nom}, maximum de chaque mois en ${annee}`}>
            <h3>{nom}</h3>
            <SerieMensuelle
              titre={`${nom}, maximum de chaque mois en ${annee}`}
              serie={serie}
              annee={annee}
              unite={info?.u ?? ''}
              limite={parseSeuil(info?.lim).max ?? null}
              juge={reseaux.length === 1}
              compact
            />
            <p className="cap">{phraseSerie(serie, annee, info?.u ?? '')}</p>
          </section>
        )
      })}
    </div>
  )
}

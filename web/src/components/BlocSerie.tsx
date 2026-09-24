import SerieMensuelle from './SerieMensuelle'
import { parseSeuil } from '../lib/hubeau'
import { phraseSerie, type MoisSerie } from '../lib/serie'
import type { ParamInfo } from '../lib/types'

/**
 * Bloc « {paramètre}, maximum de chaque mois en {année} », sous le bulletin d'une fiche commune ou réseau : la série qui
 * explique le bulletin du réseau affiché (lib/serie.ts, parametreSerie), sa phrase de résumé en dessous.
 */
export default function BlocSerie({
  parametre,
  info,
  reseau,
  annee,
  serie,
  precision = '',
}: {
  parametre: string
  info: ParamInfo | undefined
  /** nom du réseau */
  reseau: string
  annee: string
  serie: MoisSerie[]
  /** complément après le nom du réseau (« , celui qu’affiche le bulletin ») */
  precision?: string
}) {
  const nom = info?.k ?? info?.l ?? parametre
  const unite = info?.u ?? ''
  return (
    <section className="bloc-serie" aria-labelledby="serie-titre">
      <div className="bloc-tete">
        <h2 id="serie-titre">
          {nom}, maximum de chaque mois en {annee}
        </h2>
        <p className="cap">
          Réseau {reseau}
          {precision} ; un mois sans barre n’a pas eu d’analyse.
        </p>
      </div>
      <SerieMensuelle
        titre={`${nom}, maximum de chaque mois en ${annee}, réseau ${reseau}`}
        serie={serie}
        annee={annee}
        unite={unite}
        limite={parseSeuil(info?.lim).max ?? null}
      />
      <p className="serie-resume">{phraseSerie(serie, annee, unite)}</p>
    </section>
  )
}

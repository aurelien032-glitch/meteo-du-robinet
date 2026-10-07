import { useId, useState } from 'react'
import SerieMensuelle from './SerieMensuelle'
import { majuscule } from '../lib/data'
import type { FamilleReseau } from '../lib/instruments'
import { libelleParametre } from '../lib/parametres'
import { limiteSerie, phraseSerie, serieReseaux } from '../lib/serie'
import { NOMS_FAMILLES, estPartiel } from '../lib/situations'
import type { ParamInfo, SeriesReseauxFile } from '../lib/types'

/**
 * Un graphique « mois par mois » d'une famille (choix de l'auteur du 03/10) : maximum de chaque mois du paramètre
 * choisi, face à sa limite, et un menu des autres paramètres de la famille (lib/serie.ts : graphiquesBulletin sous le
 * bulletin, parametresFamille dans le détail). Plusieurs réseaux réunis : maximum du mois sur l'ensemble, mois au-dessus
 * de la limite en orange comme pour un réseau (palette couleur partout, 04/10).
 */
export default function SerieFamille({
  famille,
  parametres,
  fichier,
  reseaux,
  params,
  compact = false,
}: {
  famille: FamilleReseau
  /** paramètres proposés, le premier affiché par défaut */
  parametres: string[]
  fichier: SeriesReseauxFile
  reseaux: string[]
  params: Record<string, ParamInfo>
  compact?: boolean
}) {
  const id = useId()
  const [choisi, choisir] = useState(parametres[0])
  const parametre = parametres.includes(choisi) ? choisi : parametres[0]
  const annee = String(fichier.annee)
  const nom = (p: string) => params[p]?.k ?? libelleParametre(p, params[p]?.l)
  const info = params[parametre]
  const unite = info?.u ?? ''
  const limite = limiteSerie(parametre, info, annee)
  const serie = serieReseaux(fichier, reseaux, parametre)
  const titre = majuscule(NOMS_FAMILLES[famille])
  return (
    <section className="serie-famille" aria-labelledby={`${id}-titre`}>
      <div className="serie-tete">
        <h3 id={`${id}-titre`}>{titre}</h3>
        {parametres.length > 1 ? (
          <label>
            Paramètre{' '}
            <select value={parametre} onChange={(e) => choisir(e.target.value)}>
              {parametres.map((p) => (
                <option key={p} value={p}>
                  {nom(p)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          // Même en-tête qu'avec un menu : sans lui, le graphique commençait plus haut que ses voisins (nitrates, 05/10).
          <p className="serie-param-fixe">
            Paramètre <span>{nom(parametre)}</span>
          </p>
        )}
      </div>
      {serie ? (
        <>
          <SerieMensuelle
            titre={`${nom(parametre)}, maximum de chaque mois ${estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`}`}
            serie={serie}
            annee={annee}
            unite={unite}
            limite={limite}
            compact={compact}
          />
          <p className="serie-resume">{phraseSerie(serie, annee, unite, limite != null)}</p>
        </>
      ) : (
        <p className="muted">Aucune analyse de ce paramètre n’est publiée en {annee}.</p>
      )}
    </section>
  )
}

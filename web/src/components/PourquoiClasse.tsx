import { useId } from 'react'
import Jauge from './Jauge'
import { titrePourquoi, type FamillePourquoi } from '../lib/bilan'
import { RAPPEL_DEPASSEMENT } from '../lib/bulletin'
import type { LettreArs } from '../lib/situations'

/**
 * « Pourquoi la classe <X> » (maquettes du 2026-10-05) : pour chaque famille en cause, des phrases factuelles tirées des
 * analyses publiées (paramètre, maximum, limite, analyses au-dessus sur le total, réseaux) et une jauge simple, la valeur
 * maximale face au repère de la limite (texte équivalent en aria-label). Puis le rappel qu'un dépassement ne suffit pas à
 * déconseiller l'eau. Rien sur l'origine d'une pollution ni sur le statut d'un produit (lib/bilan.ts, pourquoi).
 */
export default function PourquoiClasse({ lettre, familles }: { lettre: LettreArs; familles: FamillePourquoi[] }) {
  const id = useId()
  return (
    // Le cadre porte la gouttière de la page (`.page > *`) ; la carte, sa propre bordure, s'aligne sur le texte.
    <div className="cadre">
      <section className="carte-fiche pourquoi" aria-labelledby={`${id}-t`}>
        <h2 className="cf-grand-titre" id={`${id}-t`}>
          {titrePourquoi(lettre)}
        </h2>
        <div className="pq-familles">
          {familles.map((f) => (
            <div className="pq-famille" key={f.famille}>
              <h3>{f.titre}</h3>
              {/* Jauge en tête de colonne, sous le nom de la famille : deux jauges voisines à la même hauteur (critique UX du
                  2026-10-05 ; elle venait après des paragraphes de longueur inégale). */}
              {f.jauge && <Jauge reglette={f.jauge.reglette} ton={f.jauge.ton} nom={f.jauge.nom} libelle={f.jauge.libelle} />}
              {f.phrases.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          ))}
        </div>
        {lettre !== 'A' && <p className="pq-rappel">{RAPPEL_DEPASSEMENT}</p>}
      </section>
    </div>
  )
}

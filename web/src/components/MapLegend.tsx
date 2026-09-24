import type { Scale } from '../lib/scale'

type Props = {
  /** Ce que la couleur représente, en une ligne. */
  desc: string
  scale: Scale
  /** Mise en forme d'une borne de palier. */
  format: (v: number) => string
  /** Libellés des états d'une échelle binaire ou à niveaux (« aucun » / « dépassement »…), un par palier. */
  binaire?: string[]
  /** Libellé du premier palier quand il désigne une absence (« aucun avis ») plutôt qu'un intervalle (« 0–1 »). */
  premier?: string
  noDataLabel?: string
}

/**
 * Légende complète d'une carte : un palier affiché par couleur réellement employée, pour qu'une teinte
 * intermédiaire soit lisible. Une échelle relative le dit, sinon deux cartes se comparent à tort.
 */
export default function MapLegend({ desc, scale, format, binaire, premier, noDataLabel = 'sans donnée' }: Props) {
  return (
    <div className="legend">
      <span className="legend-desc">{desc} :</span>
      <span className="legend-scale">
        {scale.steps.map((s, i) => (
          <span key={i} className="legend-item">
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            {binaire
              ? binaire[i]
              : premier && i === 0
                ? premier
                : scale.steps.length === 1
                ? format(s.from) // toutes les valeurs sont égales : un seul palier, sans « ≥ »
                : i === scale.steps.length - 1
                  ? `≥ ${format(s.from)}`
                  : i === 0 && (scale.ouvertBas || s.from > 0)
                    ? // Échelle bornée au-dessus de zéro (centiles) : les valeurs plus basses prennent aussi cette couleur.
                      `< ${format(scale.steps[1].from)}`
                    : `${format(s.from)}–${format(scale.steps[i + 1].from)}`}
          </span>
        ))}
        <span className="legend-item">
          {/* La couleur « sans donnée » vient de l'échelle elle-même, comme sur la carte (rampe ardoise : la surface). */}
          <span className="swatch" style={{ background: scale.color(null) }} aria-hidden="true" /> {noDataLabel}
        </span>
      </span>
      {scale.relative && (
        <span className="legend-note" title="Les couleurs sont réparties entre les valeurs affichées : changer de millésime ou de paramètre change l'échelle.">
          échelle relative aux valeurs affichées
        </span>
      )}
    </div>
  )
}

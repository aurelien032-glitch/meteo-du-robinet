import type { AnneeFiche } from '../lib/year'

/**
 * Barre d'année des fiches (règle de l'auteur, 23/09) : elle précède tout ce qu'elle gouverne et dit ce qu'elle
 * gouverne ; ce qui n'en dépend pas reste au-dessus, avec sa propre date. Boutons à bascule (aria-pressed) : le
 * millésime partiel est marqué « en cours », une année sans données pour la fiche est signalée sans être
 * retirée (lib/year.ts, anneesFiche).
 */
export default function BarreAnnee({
  titre,
  note,
  annees,
  annee,
  onChange,
  titreSection = false,
}: {
  titre: string
  note: string
  annees: AnneeFiche[]
  annee: number | undefined
  onChange: (annee: number) => void
  /** le titre est celui de la section qu'ouvre la barre (h2), non une simple légende */
  titreSection?: boolean
}) {
  const Titre = titreSection ? 'h2' : 'p'
  return (
    <div className="barre-annee">
      <div>
        <Titre className="ba-titre">{titre}</Titre>
        <p className="ba-note">{note}</p>
      </div>
      <div className="seg" role="group" aria-label="Année">
        {annees.map((a) => (
          <button key={a.annee} type="button" aria-pressed={a.annee === annee} className={a.sansDonnees ? 'sans-donnees' : undefined} onClick={() => onChange(a.annee)}>
            {a.annee}
            {a.enCours && <small> en cours</small>}
            {a.sansDonnees && <small> sans données</small>}
          </button>
        ))}
      </div>
    </div>
  )
}

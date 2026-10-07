import { useAnneeDansAdresse, type AnneeFiche } from '../lib/year'

/**
 * Barre d'année des fiches (règle de l'auteur, 23/09) : elle précède tout ce qu'elle gouverne et dit ce qu'elle
 * gouverne ; ce qui n'en dépend pas reste au-dessus, avec sa propre date. Boutons à bascule (aria-pressed) : le
 * millésime partiel est marqué « en cours », une année sans données pour la fiche est signalée sans être
 * retirée (lib/year.ts, anneesFiche). L'année affichée est toujours écrite dans l'adresse, sous la clé `param`
 * (choix de l'auteur, 25/09 : un lien partagé garde son année).
 */
export default function BarreAnnee({
  titre,
  note,
  annees,
  annee,
  onChange,
  titreSection = false,
  param = 'annee',
  compacte = false,
}: {
  titre: string
  note: string
  annees: AnneeFiche[]
  annee: number | undefined
  onChange: (annee: number) => void
  /** le titre est celui de la section qu'ouvre la barre (h2), non une simple légende */
  titreSection?: boolean
  /** clé de l'année dans l'adresse : `annee` (contrôle sanitaire), `sispea` (services d'eau), `amont` */
  param?: string
  /** dans une carte (bilan des fiches commune et réseau) : sans les filets de la barre pleine largeur */
  compacte?: boolean
}) {
  // Seulement une année proposée : avant le chargement des années, une page peut afficher une valeur d'attente (l'année
  // civile, sur les analyses) que l'adresse figerait ensuite.
  useAnneeDansAdresse(param, annees.some((a) => a.annee === annee) ? annee : undefined)
  const Titre = titreSection ? 'h2' : 'p'
  return (
    <div className={`barre-annee${compacte ? ' compacte' : ''}`}>
      <div>
        <Titre className="ba-titre">{titre}</Titre>
        <p className="ba-note">{note}</p>
      </div>
      <div className="seg" role="group" aria-label="Année">
        {annees.map((a) => (
          <button key={a.annee} type="button" aria-pressed={a.annee === annee} className={a.sansDonnees ? 'sans-donnees' : undefined} onClick={() => onChange(a.annee)}>
            {/* Un seul libellé et l'ordre chronologique sur toutes les pages (auteur, 2026-10-05, « ordre année » :
                « La France » proposait « Bilan 2025, 2026, depuis le 1er janvier, 2024, 2023 »). */}
            {/* « 2026 (en cours) » dans le même corps que l'année, comme les axes des graphiques (critique UX du 05/10). */}
            {a.annee}
            {a.enCours && ' (en cours)'}
            {a.sansDonnees && <small> sans données</small>}
          </button>
        ))}
      </div>
    </div>
  )
}

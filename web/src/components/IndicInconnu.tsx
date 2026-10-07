/**
 * Indicateur de l'adresse que la page ne connaît pas (relevé « Parcours du robinet », 25/09) : la page retombait en
 * silence sur son indicateur par défaut, contre l'esprit de la règle « jamais de bascule silencieuse ». Cas réel : la
 * fiche département, ouverte depuis /carte sur un indicateur qu'elle n'a pas (un paramètre au choix, les taux de
 * prélèvements).
 */
export default function IndicInconnu({ affiche }: { affiche: string }) {
  return (
    <p className="indic-inconnu" role="status">
      L’indicateur demandé par le lien n’existe pas sur cette page. L’indicateur « {affiche} » est affiché à la place.
    </p>
  )
}

import { partClasse, texteRepartition, type ComptesClasses } from '../lib/accueil'
import { LETTRES_ARS, LIBELLES_ARS } from '../lib/bilan'
import { fmt } from '../lib/data'

/**
 * Répartition des réseaux par classe A–D (accueil, « La France », fiche département) : barre empilée aux couleurs des
 * tuiles du lot 1, puis quatre chiffres aux libellés de l'indicateur de l'ARS, marqués d'un astérisque (la note est
 * écrite par la page). `tuiles` : chaque chiffre précédé de sa tuile, comme la maquette de « La France ».
 */
export default function RepartitionClasses({
  comptes: c,
  annee,
  tuiles = false,
  barre = true,
}: {
  comptes: ComptesClasses
  annee: string | number
  tuiles?: boolean
  /** barre empilée au-dessus des chiffres (sans elle, la liste porte le texte équivalent) */
  barre?: boolean
}) {
  if (!c.classes) return null
  return (
    <>
      {barre && (
        <div className="repartition-ars" role="img" aria-label={texteRepartition(c, annee)}>
          {LETTRES_ARS.map((l) => (c[l] ? <span key={l} className={`tuile-${l}`} style={{ flexGrow: c[l] }} /> : null))}
        </div>
      )}
      {tuiles ? (
        <ul className="chiffres-tuiles">
          {LETTRES_ARS.map((l) => (
            <li key={l}>
              <span className={`tuile-ars moyenne tuile-${l}`} aria-hidden="true">
                {l}
              </span>
              <span className="ct-texte">
                <span className="ct-nb">{fmt.int(c[l])}</span>
                <span>
                  <span className="sr-only">Note {l}, </span>
                  {c[l] > 1 ? 'réseaux' : 'réseau'} de {LIBELLES_ARS[l]}* <span className="ct-part">({fmt.pct(100 * (partClasse(c, l) ?? 0), 1)})</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="chiffres-ars">
          {LETTRES_ARS.map((l) => (
            <li key={l}>
              <span className="ca-part">{fmt.pct(100 * (partClasse(c, l) ?? 0), 1)}</span>
              <span>
                <b>{l}</b> {LIBELLES_ARS[l]}*
              </span>
              <span className="ca-nb">{fmt.nb(c[l], 'réseau', 'réseaux')}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

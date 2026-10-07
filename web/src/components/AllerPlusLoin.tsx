import { useId } from 'react'
import { Link, type To } from 'react-router-dom'

export interface LienPlusLoin {
  to: To
  titre: string
  texte: string
}

/**
 * « Pour aller plus loin » des fiches commune et réseau (maquettes du 2026-10-05) : le technique hors du premier plan,
 * en cartes-liens (nom et une ligne) vers les sections repliées de la fiche, les analyses et le lexique.
 */
export default function AllerPlusLoin({ liens }: { liens: LienPlusLoin[] }) {
  const id = useId()
  return (
    <nav className="plus-loin" aria-labelledby={`${id}-t`}>
      <h2 className="cf-grand-titre" id={`${id}-t`}>
        Pour aller plus loin
      </h2>
      <ul>
        {liens.map((l) => (
          <li key={l.titre}>
            <Link to={l.to} className="pl-carte">
              <b>{l.titre}</b>
              <span>{l.texte}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

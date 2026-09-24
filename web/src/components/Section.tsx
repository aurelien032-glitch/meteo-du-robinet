import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Section dépliable d'une fiche longue (refonte du 2026-09-22 : « synthèse puis détails dépliables »).
 * La fiche de commune faisait près de 5 000 px, avec neuf tableaux de même poids visuel ; la réponse tient
 * désormais en tête et le reste s'ouvre au besoin.
 *
 * Deux précautions :
 *  · le contenu n'est monté qu'à la première ouverture — un <details> replié monte quand même ses enfants,
 *    ce qui lancerait tous les téléchargements de la fiche et dimensionnerait une carte MapLibre à 0 px ;
 *  · une ancre (#service) ouvre la section visée, sinon un lien profond arriverait sur un titre fermé.
 */
export default function Section({
  id,
  titre,
  resume,
  ouvert: ouvertParDefaut = false,
  children,
}: {
  id: string
  titre: string
  resume?: string
  ouvert?: boolean
  children: ReactNode
}) {
  const { hash } = useLocation()
  const vise = hash === `#${id}`
  const [ouvert, setOuvert] = useState(ouvertParDefaut || vise)
  const [monte, setMonte] = useState(ouvertParDefaut || vise)
  useEffect(() => {
    if (vise) {
      setOuvert(true)
      setMonte(true)
    }
  }, [vise])
  return (
    <details
      className="section"
      id={id}
      open={ouvert}
      onToggle={(e) => {
        const o = e.currentTarget.open
        setOuvert(o)
        if (o) setMonte(true)
      }}
    >
      <summary>
        <h2>{titre}</h2>
        {resume && <span className="section-resume">{resume}</span>}
      </summary>
      <div className="section-corps">{monte && children}</div>
    </details>
  )
}

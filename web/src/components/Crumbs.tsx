import { Link } from 'react-router-dom'

/**
 * Fil d'Ariane uniforme, racine « Accueil » sur toutes les pages (parcours, 2026-10-06 : « France » sur la plupart des
 * pages et « Accueil » sur La France, et « France › La France › Aisne » sur la fiche département). Les fiches suivent les
 * quatre échelles : Accueil › La France › département › commune › réseau (`echelleFrance`). Le dernier élément n'est pas
 * un lien.
 */
export default function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <p className="crumbs">
      <Link to="/">Accueil</Link>
      {items.map((it, i) => (
        <span key={i}>
          {' › '}
          {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </p>
  )
}

/** Premier échelon des fiches géographiques (département, commune, réseau, service). */
export const echelleFrance = { label: 'La France', to: '/france' } as const

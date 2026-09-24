import { Link } from 'react-router-dom'

/** Fil d'Ariane uniforme : France › département › commune › réseau. Le dernier élément n'est pas un lien. */
export default function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <p className="crumbs">
      <Link to="/">France</Link>
      {items.map((it, i) => (
        <span key={i}>
          {' › '}
          {it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span>{it.label}</span>}
        </span>
      ))}
    </p>
  )
}

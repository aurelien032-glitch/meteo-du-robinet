/**
 * Chiffre clé, toujours neutre (grammaire du 23/09) : un chiffre agrégé ne porte pas de couleur de jugement, et
 * l'orange ne tient pas le contraste d'un texte. Le jugement d'un réseau passe par son voyant (lib/situations.ts).
 */
export default function Kpi({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="card kpi">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

import type { Ton } from '../lib/situations'
import Voyant from './Voyant'

/**
 * Chiffre clé. Le chiffre reste à l'encre (grammaire du 23/09) : un agrégat ne porte pas de couleur de jugement,
 * et l'orange ne tient pas le contraste d'un texte. Quand le libellé compte un état de la palette de « Lire un
 * bulletin » (départements en crise, communes sous restriction, prélèvements conformes…), `ton` pose le voyant
 * de cet état devant le libellé, comme une légende (règle « juger et alerter en couleur », auteur, 24/09).
 */
export default function Kpi({ value, label, sub, ton }: { value: string; label: string; sub?: string; ton?: Ton | null }) {
  return (
    <div className="card kpi">
      <div className="value">{value}</div>
      {ton !== undefined ? (
        <div className="label avec-voyant">
          <Voyant ton={ton} taille={16} />
          <span>{label}</span>
        </div>
      ) : (
        <div className="label">{label}</div>
      )}
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

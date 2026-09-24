import { Link } from 'react-router-dom'
import { useJson } from '../lib/hooks'
import { INDICS_RESSOURCE, fmtRessource, valeurRessource } from '../lib/ressource'
import type { RessourceFile } from '../lib/types'

/** Pression sur la ressource d'un département, indicateur par indicateur, face à la valeur France. */
export default function DeptPressionCard({ dd }: { dd: string }) {
  const r = useJson<RessourceFile>('ressource/national.json').data
  if (!r) return null
  const d = r.depts[dd]
  if (!d) return null
  const n = r.national
  return (
    <div className="card" id="pression">
      <h2>Pression sur la ressource</h2>
      <div className="table-scroll"><table className="data">
        <thead>
          <tr>
            <th>Indicateur</th>
            <th className="num">Département</th>
            <th className="num">France</th>
          </tr>
        </thead>
        <tbody>
          {INDICS_RESSOURCE.map((i) => {
            const v = valeurRessource(d, i.key)
            const f = valeurRessource(n, i.key)
            return (
              <tr key={i.key}>
                <td>
                  {i.label} <span className="muted">({i.annee(n)})</span>
                </td>
                <td className="num">
                  <b>{fmtRessource(i, v)}</b>
                </td>
                <td className="num muted">{fmtRessource(i, f)}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div className="source">
        Pas de volumes autorisés (arrêtés de DUP) : ils ne sont pas publiés en données ouvertes. « – » : donnée absente ou non comparable.{' '}
        <Link to={`/ressource`}>Tous les départements</Link>.
      </div>
    </div>
  )
}

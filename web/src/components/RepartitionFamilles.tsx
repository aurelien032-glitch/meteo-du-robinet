import { fmt } from '../lib/data'
import type { CommuneYearStats, ParamsFile } from '../lib/types'

/**
 * Analyses de l'année par famille de paramètres, de la plus analysée à la moins analysée : des comptes, pas des
 * jugements, donc sans couleur (grammaire du 23/09). Fiches commune et réseau.
 */
export default function RepartitionFamilles({ s, params }: { s: CommuneYearStats; params: ParamsFile }) {
  return (
    <div className="card">
      <div className="table-scroll">
        <table className="data">
          <caption className="sr-only">Analyses du millésime par famille de paramètres, classées de la plus analysée à la moins analysée</caption>
          <thead>
            <tr>
              <th>Famille</th>
              <th className="num">Analyses</th>
              <th className="num">Quantifiées</th>
              <th className="num">Au-dessus de la limite</th>
              <th className="num">Au-dessus de la référence</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.fam)
              .sort((a, b) => (b[1]?.[0] ?? 0) - (a[1]?.[0] ?? 0))
              .map(([f, v]) => (
                <tr key={f}>
                  <td>{params.familles[f as keyof typeof params.familles]}</td>
                  <td className="num">{fmt.int(v![0])}</td>
                  <td className="num">{fmt.int(v![3])}</td>
                  <td className="num">{fmt.int(v![1])}</td>
                  <td className="num">{fmt.int(v![2])}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="source">Limite de qualité = seuil sanitaire réglementaire ; référence de qualité = repère de bon fonctionnement, sans effet sur la potabilité.</div>
    </div>
  )
}

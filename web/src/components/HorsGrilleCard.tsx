import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import type { CommuneYearStats, HgGroupe, HorsGrilleFile, ParamsFile } from '../lib/types'

const VEDETTES: [string, string][] = [
  ['6219', 'Perchlorate'],
  ['8858', 'TFA (acide trifluoroacétique)'],
]
const GROUPES: HgGroupe[] = ['metabolites', 'pfas', 'haloacetiques', 'autres']

function val(v: number | null | undefined): string {
  if (v == null) return '–'
  return fmt.dec(v, v < 1 ? 3 : v < 10 ? 2 : 1)
}

/**
 * Substances analysées sans limite ni référence de qualité, sur les réseaux de la commune : jamais comptées
 * comme dépassements ailleurs sur la fiche. Le perchlorate et le TFA ont un statut explicite, parce que
 * « non recherché » et « recherché, non quantifié » ne disent pas la même chose.
 */
export default function HorsGrilleCard({ s, params, year }: { s: CommuneYearStats; params: ParamsFile; year: string }) {
  const hg = useJson<HorsGrilleFile>('horsgrille.json').data
  if (!hg) return null
  const lignes = s.hg?.s ?? []
  const parCode = new Map(lignes.map((l) => [l[0], l]))
  const l = (c: string) => params.params[c]?.l ?? hg.substances[c]?.l
  const autres = lignes.filter(([c]) => !VEDETTES.some(([v]) => v === c) && l(c))
  const unite = (c: string) => params.params[c]?.u ?? hg.substances[c]?.u ?? ''
  const auDela = (c: string, v: number | null) => (hg.substances[c]?.reperes ?? []).filter((r) => v != null && v > r.v)

  return (
    <div className="card" id="horsgrille">
      <h2>Sans limite de qualité · {year}</h2>
      <p className="muted">
        Substances analysées sur les réseaux de la commune mais sans limite ni référence de qualité : elles ne comptent jamais comme dépassements.
      </p>
      <div className="table-scroll"><table className="data">
        <tbody>
          {VEDETTES.map(([c, nom]) => {
            const r = parCode.get(c)
            const au = r ? auDela(c, r[3]) : []
            return (
              <tr key={c}>
                <td>{nom}</td>
                <td>
                  {!r ? (
                    <span className="muted">non recherché</span>
                  ) : r[2] === 0 ? (
                    <span className="muted">recherché ({fmt.int(r[1])} analyse{r[1] > 1 ? 's' : ''}), non quantifié</span>
                  ) : (
                    <>
                      <b>
                        {val(r[3])} {unite(c)}
                      </b>{' '}
                      <span className="muted">
                        au maximum · quantifié {fmt.int(r[2])} fois sur {fmt.int(r[1])}
                      </span>
                      {au.length > 0 && (
                        <div>
                          <b>au-delà de {fmt.int(au[au.length - 1].v)} µg/L</b> <span className="muted">{au[au.length - 1].lib}</span>
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            )
          })}
          {GROUPES.map((g) => {
            const n = s.hg?.g[g]
            return (
              <tr key={g}>
                <td>{hg.groupes[g]}</td>
                <td>{n ? `${n[0]} substance${n[0] > 1 ? 's' : ''} recherchée${n[0] > 1 ? 's' : ''}, ${n[1]} quantifiée${n[1] > 1 ? 's' : ''}` : <span className="muted">non recherchés</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      {autres.length > 0 && (
        <details>
          <summary>
            {autres.length} substance{autres.length > 1 ? 's' : ''} quantifiée{autres.length > 1 ? 's' : ''} sans limite
          </summary>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Substance</th>
                <th className="num">Quantifiée</th>
                <th className="num">Maximum</th>
              </tr>
            </thead>
            <tbody>
              {autres.map(([c, n, nq, vmax]) => {
                const au = auDela(c, vmax)
                return (
                  <tr key={c}>
                    <td>{l(c)}</td>
                    <td className="num">
                      {fmt.int(nq)} / {fmt.int(n)}
                    </td>
                    <td className="num">
                      {au.length ? <strong>{val(vmax)}</strong> : val(vmax)} {unite(c)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          {autres.some(([c, , , v]) => auDela(c, v).length) && (
            <p className="muted">En gras : au-delà de la « valeur de vigilance » de 0,9 µg/L citée par les ARS pour les métabolites sans limite.</p>
          )}
        </details>
      )}
      <div className="source">
        Contrôle sanitaire SISE-Eaux. Les repères cités ne sont pas des limites de qualité. <Link to="/hors-grille">Ce que la grille n'encadre pas, en France</Link>.
      </div>
    </div>
  )
}

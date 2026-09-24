import { fmt } from '../lib/data'
import type { CommuneYearStats, ParamRec, ParamsFile } from '../lib/types'

const KEY_ORDER = ['1340', '6276', '8847', '1449', '6455', '1382', '1753', '1369', '7073', '2036', '1394', '1345', '1302', '1398', '2098']

/**
 * Résultats du contrôle sanitaire d'une année, dans le détail replié des fiches commune et réseau : les
 * dépassements de limite et les paramètres clés. Les comptes de l'année sont dans le bulletin (lib/bulletin.ts) ;
 * le jugement de la bactériologie d'un réseau suit la méthode des ARS (toneSituation), et non plus une tuile colorée.
 * Tableaux neutres (auteur, 24/09) : un dépassement s'écrit en gras, jamais en rouge — sur une fiche commune, le
 * tableau additionne les réseaux de la commune, et la couleur ne juge qu'un réseau, dans le bulletin.
 */
export default function QualityStats({ s, params, year }: { s: CommuneYearStats; params: ParamsFile; year: string }) {
  const info = (p: string) => params.params[p]
  return (
      <div className="grid cols-2">
        <div className="card" id="depassements">
          <h2>Dépassements de la limite de qualité</h2>
          {s.dep.length === 0 ? (
            <p className="muted">Aucune analyse au-dessus d'une limite de qualité en {year}.</p>
          ) : (
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th>Paramètre</th>
                  <th>Limite</th>
                  <th className="num">Analyses</th>
                  <th className="num">Dépassements</th>
                  <th className="num">Maximum</th>
                </tr>
              </thead>
              <tbody>
                {s.dep.map((d) => (
                  <tr key={d[0]}>
                    <td>{info(d[0])?.l ?? d[0]}</td>
                    <td className="muted">{fmt.seuil(info(d[0])?.lim)}</td>
                    <td className="num">{fmt.int(d[1])}</td>
                    <td className="num">
                      <strong>{d[2]}</strong>
                    </td>
                    <td className="num">
                      {fmt.sig(d[5])} {info(d[0])?.u ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <div className="source">Limite de qualité = seuil sanitaire réglementaire. Les dépassements de simple « référence de qualité » ne sont pas comptés ici.</div>
        </div>
        <div className="card" id="parametres">
          <h2>Paramètres clés</h2>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Paramètre</th>
                <th className="num">Dernière valeur</th>
                <th className="num wrap">
                  Max {year}
                </th>
                <th>Limite</th>
              </tr>
            </thead>
            <tbody>
              {KEY_ORDER.filter((k) => s.cle[k]).map((k) => {
                const r: ParamRec = s.cle[k]
                const i = info(k)
                return (
                  <tr key={k}>
                    <td>
                      {params.cles[k] ?? i?.l}
                      <span className="muted"> · {fmt.nb(r[0], 'analyse')}</span>
                    </td>
                    <td className="num">
                      {r[3] === 0 ? <span className="muted">non détecté</span> : `${fmt.sig(r[6])} ${i?.u ?? ''}`}
                      {r[7] && <span className="muted"> ({r[7].slice(8, 10)}/{r[7].slice(5, 7)})</span>}
                    </td>
                    <td className="num">
                      {r[1] > 0 ? (
                        <>
                          <strong>{fmt.sig(r[4])}</strong> <span className="muted">au-dessus de la limite</span>
                        </>
                      ) : (
                        fmt.sig(r[4])
                      )}
                    </td>
                    <td className="muted">{i?.lim ? fmt.seuil(i.lim) : i?.ref ? `${fmt.seuil(i.ref)} (référence)` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          <div className="source">« Non détecté » : toutes les analyses sous la limite de quantification. Dernière valeur = analyse la plus récente du millésime.</div>
        </div>
      </div>
  )
}

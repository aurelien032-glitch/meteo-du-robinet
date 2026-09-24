import { fmt } from '../lib/data'
import Chargement from './Chargement'
import { useJson } from '../lib/hooks'
import type { AmontDeptFile } from '../lib/types'

const MILIEU: Record<string, string> = { SOUT: 'souterrain', CONT: 'superficiel', INC: 'milieu inconnu' }

/** Ouvrages de prélèvement et points de suivi des nappes situés sur la commune (BNPE, ADES). */
export default function OrigineCard({ insee, dept }: { insee: string; dept: string }) {
  const file = useJson<AmontDeptFile>(`amont/dept/${dept}.json`)
  if (file.error) return null
  if (!file.data) return <Chargement carte texte="Chargement des prélèvements…" />
  const ouvrages = Object.entries(file.data.ouvrages)
    .filter(([, o]) => o.commune === insee)
    .map(([code, o]) => {
      const years = Object.keys(o.volumes).sort()
      const last = years[years.length - 1]
      return { code, ...o, last, vol: last ? o.volumes[last] : null }
    })
    .sort((a, b) => (b.vol ?? 0) - (a.vol ?? 0))
  const nappes = Object.entries(file.data.nappes).filter(([, n]) => n.commune === insee)
  // Total sur une seule année (la plus récente déclarée) : additionner le dernier volume de chaque ouvrage
  // mêlerait des millésimes différents sous une même date.
  const annee = ouvrages.map((o) => o.last).filter(Boolean).sort().pop()
  const declares = annee ? ouvrages.filter((o) => o.volumes[annee] != null) : []
  const total = declares.reduce((a, o) => a + (o.volumes[annee!] ?? 0), 0)
  return (
    <div className="card">
      <h2>D'où vient l'eau</h2>
      {ouvrages.length === 0 ? (
        <p className="muted">Aucun ouvrage de prélèvement pour l'eau potable recensé sur le territoire de la commune : l'eau vient d'ailleurs, par le réseau.</p>
      ) : (
        <>
          <p>
            <b>{ouvrages.length}</b> ouvrage{ouvrages.length > 1 ? 's' : ''} de prélèvement pour l'eau potable sur la commune
            {annee && (
              <>
                , <b>{fmt.int(total)} m³</b> prélevés en {annee}
                {declares.length < ouvrages.length ? ` par les ${declares.length} ouvrages déclarés cette année-là` : ''}
              </>
            )}
            .
          </p>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Ouvrage</th>
                <th>Milieu</th>
                <th className="num">Volume annuel</th>
              </tr>
            </thead>
            <tbody>
              {ouvrages.slice(0, 8).map((o) => (
                <tr key={o.code}>
                  <td>{o.nom ?? o.code}</td>
                  <td className="muted">{MILIEU[o.milieu] ?? o.milieu}</td>
                  <td className="num">
                    {fmt.int(o.vol)} m³ <span className="muted">({o.last})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      {nappes.length > 0 && (
        <>
          <h3 style={{ marginTop: 'var(--s4)' }}>Nappes suivies sur la commune</h3>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Point</th>
                <th className="num">Nitrates, dernier</th>
                <th className="num">Nitrates, max (seuil 50)</th>
                <th className="num">Pesticides, max (seuil 0,5)</th>
              </tr>
            </thead>
            <tbody>
              {nappes.slice(0, 6).map(([bss, n]) => (
                <tr key={bss}>
                  <td>
                    {bss} {n.aep && <span className="badge">eau brute AEP</span>}
                  </td>
                  <td className="num">{n.nitrates ? `${fmt.dec(n.nitrates.dernier, 1)} mg/L (${n.nitrates.annee})` : '–'}</td>
                  <td className="num">
                    {n.nitrates ? `${fmt.dec(n.nitrates.max, 1)} mg/L${(n.nitrates.max ?? 0) > 50 ? ', au-dessus de 50' : ''}` : '–'}
                  </td>
                  <td className="num">
                    {n.pesticides ? `${fmt.dec(n.pesticides.max, 2)} µg/L${(n.pesticides.max ?? 0) > 0.5 ? ', au-dessus de 0,5' : ''}` : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      <div className="source">
        Sources : BNPE (volumes prélevés par ouvrage, Hub'Eau) et ADES (qualité des eaux souterraines depuis 2020, Hub'Eau). Un ouvrage situé
        sur la commune peut alimenter d'autres communes, et inversement.
      </div>
    </div>
  )
}

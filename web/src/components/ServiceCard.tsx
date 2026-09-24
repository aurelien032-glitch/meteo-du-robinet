import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { renseigne } from '../lib/sispea'
import type { SispeaDeptFile, SispeaNationalFile, SispeaYear } from '../lib/types'

// Indicateurs SISPEA, face à la médiane France : un repère neutre, sans « mieux » ni « moins bien » (les
// indicateurs d'un service ne sont pas des jugements de conformité ; grammaire des couleurs du 23/09).
const ROWS: { code: string; label: string; unit: string; nat: keyof Omit<SispeaYear, 'n' | 'pop'> }[] = [
  { code: 'D102.0', label: 'Prix TTC du m³ (base 120 m³/an)', unit: '€', nat: 'prix' },
  { code: 'P104.3', label: 'Rendement du réseau', unit: '%', nat: 'rend' },
  { code: 'P106.3', label: 'Pertes en réseau', unit: 'm³/km/jour', nat: 'ilp' },
  { code: 'P107.2', label: 'Renouvellement annuel des canalisations', unit: '%', nat: 'renouv' },
  { code: 'P101.1', label: 'Conformité microbiologique (déclarée)', unit: '%', nat: 'cbact' },
  { code: 'P102.1', label: 'Conformité physico-chimique (déclarée)', unit: '%', nat: 'cchim' },
  { code: 'P103.2B', label: 'Connaissance du patrimoine', unit: '/120', nat: 'patrim' },
  { code: 'P154.0', label: 'Taux d’impayés', unit: '%', nat: 'impayes' },
]

/** Encart « service d'eau » d'une commune : gestionnaire, mode de gestion, prix, fuites, renouvellement. */
export default function ServiceCard({ insee, dept, year }: { insee: string; dept: string; year: string | undefined }) {
  const file = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  if (file.error || !file.data || !nat) return null
  const byYear = file.data[insee]
  if (!byYear)
    return (
      <div className="card">
        <h2>Service d'eau</h2>
        <p className="muted">Commune absente de l'observatoire des services (SISPEA).</p>
      </div>
    )
  const years = Object.keys(byYear).sort()
  // Millésime demandé si le service y a déclaré des indicateurs, sinon le dernier renseigné.
  const withData = years.filter((y) => Object.keys(byYear[y].ind).length > 0)
  const y = year && withData.includes(year) ? year : withData[withData.length - 1] ?? years[years.length - 1]
  const s = byYear[y]
  // La comparaison nationale ne prend l'année du service que si elle est elle-même assez déclarée (>=3000
  // services avec un prix, le même seuil que la page Services) ; sinon le dernier millésime qui l'est,
  // pour ne pas comparer à une « médiane » calculée sur une poignée de déclarants précoces.
  const natYears = Object.keys(nat.annees).filter((a) => (nat.annees[a].prix.n ?? 0) >= 3000).sort()
  const natYear = natYears.includes(y) ? y : natYears[natYears.length - 1]
  const natY = natYear ? nat.annees[natYear] : undefined
  const prix = s.ind['D102.0']
  // La SISPEA met « . » faute de valeur (lib/sispea.ts).
  const mode = renseigne(s.mode)
  const exploitant = renseigne(s.op)

  return (
    <div className="card">
      <div className="toolbar" style={{ margin: 0 }}>
        <h2>Service d'eau · {y}</h2>
        {s.id && (
          <Link to={`/service/${s.id}`} className="muted">
            voir la collectivité →
          </Link>
        )}
        <Link to="/services" className="muted">
          comparer en France →
        </Link>
      </div>
      <p>
        <b>{s.coll ?? s.nom ?? 'Service inconnu'}</b>
        {s.nom && s.coll ? <span className="muted"> · {s.nom}</span> : null}
        <br />
        {mode && <span className="badge neutre">{mode}</span>} {exploitant && <span className="muted">exploitant : {exploitant}</span>}
        {s.pop != null && <span className="muted"> · {fmt.int(s.pop)} habitants desservis</span>}
      </p>
      {prix != null && natY && (
        <p>
          Une consommation de 120 m³ par an coûte environ <b>{fmt.int(prix * 120)} €</b> d'eau potable, contre{' '}
          <b>{fmt.int((natY.prix.p50 ?? 0) * 120)} €</b> pour le service médian en France{natYear !== y ? ` (${natYear})` : ''}.
        </p>
      )}
      {Object.keys(s.ind).length === 0 ? (
        <p className="muted">Indicateurs non encore publiés pour ce millésime ({s.statut ?? 'statut inconnu'}).</p>
      ) : (
        <div className="table-scroll"><table className="data">
          <thead>
            <tr>
              <th>Indicateur</th>
              <th className="num">Ce service</th>
              <th className="num">Médiane France{natYear && natYear !== y ? ` (${natYear})` : ''}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((r) => s.ind[r.code] != null).map((r) => {
              const v = s.ind[r.code]
              const med = natY?.[r.nat]?.p50 ?? null
              return (
                <tr key={r.code}>
                  <td>{r.label}</td>
                  <td className="num">
                    <b>
                      {fmt.dec(v, 2)} {r.unit}
                    </b>
                  </td>
                  <td className="num muted">{med == null ? '–' : `${fmt.dec(med, 2)} ${r.unit}`}</td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      )}
      <div className="source">
        Source : observatoire des services d'eau et d'assainissement (SISPEA, OFB), données déclarées par les collectivités.
        {s.statut ? ` Statut : ${s.statut}.` : ''}
      </div>
    </div>
  )
}

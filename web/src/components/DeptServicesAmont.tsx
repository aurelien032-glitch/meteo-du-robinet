import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { anneesSispea } from '../lib/sispea'
import type { AmontFile, SispeaNationalFile } from '../lib/types'

/**
 * Section « Les services d'eau et l'amont » de la fiche département : indicateurs SISPEA du département (prix, rendement,
 * renouvellement, gestion déléguée) et croisement amont (prélèvements en nappe, ventes de pesticides, points de nappe
 * au-dessus des seuils). Du contexte, écrit à l'encre, sans jugement.
 */
export default function DeptServicesAmont({ dd }: { dd: string }) {
  const sispea = useJson<SispeaNationalFile>('sispea/national.json').data
  const amont = useJson<AmontFile>('amont/national.json').data
  // Millésime SISPEA propre au bloc, indépendant de la barre du contrôle sanitaire (critique UX du 2026-10-05 : la fiche
  // montrait 2025, 13 services, quand la page des services publie 2024) : la dernière année publiée en France (au moins
  // SEUIL_DECLARANTS déclarants, anneesSispea) qui compte au moins cinq services renseignés dans le département.
  const publiees = new Set(anneesSispea(sispea))
  const sispeaYears = sispea ? Object.keys(sispea.depts[dd] ?? {}).filter((a) => publiees.has(a) && (sispea.depts[dd][a].prix.n ?? 0) >= 5).sort() : []
  const sy = sispeaYears[sispeaYears.length - 1]
  const sd = sy ? sispea?.depts[dd][sy] : undefined
  const cro = amont?.croisement.depts?.[dd]
  return (
    <div className="grid cols-2">
      <div className="card">
        <h2>Services d'eau du département {sy ? `· ${sy}` : ''}</h2>
        {!sd ? (
          <p className="muted">Pas d'indicateurs SISPEA publiés.</p>
        ) : (
          <div className="table-scroll"><table className="data tableau-court">
            <tbody>
              <tr>
                <td>Prix moyen pondéré du m³</td>
                <td className="num">
                  <b>{fmt.dec(sd.prix.pond, 2)} €</b> <span className="muted med-sous">médiane {fmt.dec(sd.prix.p50, 2)} €, {fmt.nb(sd.prix.n, 'service')}</span>
                </td>
              </tr>
              <tr>
                <td>Rendement pondéré du réseau</td>
                <td className="num">
                  <b>{fmt.pct(sd.rend.pond, 1)}</b>
                </td>
              </tr>
              <tr>
                <td>Renouvellement annuel médian</td>
                <td className="num">
                  <b>{fmt.pct(sd.renouv.p50, 2)}</b>
                </td>
              </tr>
              <tr>
                <td>Population en gestion déléguée</td>
                <td className="num">
                  <b>{fmt.pct(sd.part_pop_delegation == null ? null : 100 * sd.part_pop_delegation, 0)}</b>
                </td>
              </tr>
            </tbody>
          </table></div>
        )}
        <div className="source">
          Source : SISPEA (OFB). <Link to="/services">Comparer les départements</Link>.
        </div>
      </div>
      <div className="card">
        <h2>L'amont</h2>
        {!cro ? (
          <p className="muted">Pas de données amont pour ce département.</p>
        ) : (
          <div className="table-scroll"><table className="data tableau-court">
            <tbody>
              <tr>
                <td>Eau potable prélevée en nappe</td>
                <td className="num">
                  <b>{fmt.pct(cro.aep_part_sout == null ? null : 100 * cro.aep_part_sout, 0)}</b>{' '}
                  <span className="muted">{cro.aep_volume == null ? '–' : `${fmt.int(cro.aep_volume / 1e6)} millions de m³`}</span>
                </td>
              </tr>
              <tr>
                <td>Substances phytopharmaceutiques vendues ({amont?.bnvd.annee_ref})</td>
                <td className="num">
                  <b>{fmt.int((cro.ventes_kg ?? 0) / 1000)} t</b>
                </td>
              </tr>
              <tr>
                <td>Points de nappe au-dessus de 50 mg/L de nitrates</td>
                <td className="num">
                  <b>
                    {fmt.int(cro.nappes_nitrates_sup50 ?? 0)} / {fmt.int(cro.nappes_nitrates_n ?? 0)}
                  </b>
                </td>
              </tr>
              <tr>
                <td>Points de nappe au-dessus de 0,5 µg/L de pesticides</td>
                <td className="num">
                  <b>
                    {fmt.int(cro.nappes_pesticides_sup ?? 0)} / {fmt.int(cro.nappes_pesticides_n ?? 0)}
                  </b>
                </td>
              </tr>
            </tbody>
          </table></div>
        )}
        <div className="source">
          Sources : BNPE, BNV-D, ADES via Hub'Eau. <Link to="/amont">Voir l'amont en France</Link>.
        </div>
      </div>
    </div>
  )
}

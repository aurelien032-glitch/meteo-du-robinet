import { Link } from 'react-router-dom'
import Tag from './Tag'
import { toneAvisCode } from '../lib/avis'
import { fmt, majuscule } from '../lib/data'
import { AVIS_PAR_CODE } from '../lib/types'

/** Commune d'une liste : niveau d'avis de l'ARS (MapRow[14]) ou taux de prélèvements non conformes (0 à 1). */
export interface CommuneListee {
  insee: string
  nom: string
  plv: number
  v: number
}

/**
 * Communes ayant reçu un avis de l'ARS, du plus grave au moins grave, version textuelle de la carte communale (fiche
 * département, /carte) ; un avis vise des habitants, la liste compte donc des communes. Sur /carte, `taux` y range
 * aussi les communes aux prélèvements non conformes, sans compte. Chaque nom est un lien : la carte n'est pas
 * navigable au clavier (FranceMap.tsx). Le survol d'une ligne met la commune en évidence sur la carte.
 */
export default function CommunesAvis({
  communes,
  legende,
  taux = false,
  prelevements = false,
  survol,
  onSurvol,
}: {
  communes: readonly CommuneListee[]
  /** légende du tableau lue par les lecteurs d'écran */
  legende: string
  taux?: boolean
  /** nombre de prélèvements après le nom */
  prelevements?: boolean
  survol: string | null
  onSurvol: (insee: string | null) => void
}) {
  return (
    <div className="table-scroll">
      <table className="data">
        <caption className="sr-only">{legende}</caption>
        <thead>
          <tr>
            <th>Commune</th>
            <th className="num">{taux ? 'Non conformes' : 'Avis'}</th>
          </tr>
        </thead>
        <tbody>
          {communes.map((c) => (
            <tr key={c.insee} className={survol === c.insee ? 'on' : undefined} onMouseEnter={() => onSurvol(c.insee)} onMouseLeave={() => onSurvol(null)}>
              <td>
                <Link to={`/commune/${c.insee}`}>{c.nom}</Link>
                {prelevements && <span className="muted"> · {fmt.int(c.plv)} prélèvements</span>}
              </td>
              <td className="num">
                {/* Étiquette de l'avis, au ton de toneAvis. */}
                {taux ? fmt.pct(100 * c.v, 1) : <Tag ton={toneAvisCode(c.v)}>{majuscule(AVIS_PAR_CODE[c.v])}</Tag>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

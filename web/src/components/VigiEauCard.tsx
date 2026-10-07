import { Link } from 'react-router-dom'
import Tag from './Tag'
import { NIVEAUX_SECHERESSE, rangZone, secheresseCommune, TONS_SECHERESSE, TYPES_ZONE, useVigiEau } from '../lib/vigieau'

/**
 * Restrictions sécheresse en vigueur aujourd'hui, interrogées en direct chez VigiEau (lib/vigieau.ts : une seule
 * requête partagée avec la bande ressource de la fiche). Un niveau de restriction est une alerte officielle (règle
 * « juger et alerter en couleur », auteur, 24/09) : chaque niveau, celui de la commune comme celui de chaque zone,
 * prend l'étiquette de son ton (TONS_SECHERESSE), la même que sur la carte ; l'absence de restriction, le bleu de « conforme ».
 */
export default function VigiEauCard({ insee }: { insee: string }) {
  const { zones, erreur } = useVigiEau(insee)
  const today = new Date().toLocaleDateString('fr-FR')
  if (erreur)
    return (
      <div className="card">
        <h2>Restrictions sécheresse</h2>
        <p className="muted">
          {erreur.includes('plusieurs zones')
            ? 'VigiEau ne rattache pas cette commune à une zone unique. Les restrictions applicables figurent sur la carte nationale.'
            : 'Le service VigiEau ne répond pas pour le moment.'}{' '}
          <Link to="/secheresse">Voir la carte des restrictions</Link>
        </p>
      </div>
    )
  if (!zones) return <div className="card muted">Interrogation de VigiEau…</div>
  const { actives, niveau } = secheresseCommune(zones)
  return (
    <div className="card">
      <h2>Restrictions sécheresse · {today}</h2>
      {actives.length === 0 ? (
        <p>
          <Tag ton={TONS_SECHERESSE[0]}>Aucune restriction</Tag> <span className="muted">en vigueur sur la commune aujourd'hui.</span>
        </p>
      ) : (
        <>
          <p>
            <Tag ton={TONS_SECHERESSE[niveau]}>{NIVEAUX_SECHERESSE[niveau]}</Tag> <span className="muted">niveau le plus élevé sur la commune</span>
          </p>
          <div className="table-scroll">
            <table className="data">
              <tbody>
                {actives.map((z) => (
                  <tr key={z.id}>
                    <td>
                      {z.nom}
                      <div className="muted text-xs">
                        {TYPES_ZONE[z.type] ?? z.type}
                        {z.arrete?.dateDebutValidite ? ` · arrêté du ${new Date(z.arrete.dateDebutValidite).toLocaleDateString('fr-FR')}` : ''}
                      </div>
                    </td>
                    <td className="num">
                      <Tag ton={TONS_SECHERESSE[rangZone(z)]}>{NIVEAUX_SECHERESSE[rangZone(z)]}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="source">
        Source : VigiEau, ministère de la Transition écologique, interrogé en direct.{' '}
        <a href={`https://vigieau.gouv.fr/`} target="_blank" rel="noreferrer">
          Détail des usages restreints
        </a>
      </div>
    </div>
  )
}

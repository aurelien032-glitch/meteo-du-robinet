import { useId } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { NBSP } from '../lib/instruments'
import { libelleMode, serviceDeCommune } from '../lib/sispea'
import type { SispeaDeptFile } from '../lib/types'

/**
 * « Prix et service » de la fiche commune (maquettes du 2026-10-05) : une ligne, avec les données de « Qui la
 * distribue ? » (serviceDeCommune) : prix du m³ TTC pour 120 m³ par an, daté de sa déclaration SISPEA (il ne suit pas
 * l'année du bilan), nom du service, mode de gestion, lien vers la fiche du service.
 */
export default function PrixService({ insee, dept }: { insee: string; dept: string }) {
  const id = useId()
  const sispea = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  if (!sispea.data && !sispea.error) return null
  const s = serviceDeCommune(sispea.data, insee)
  const mode = s ? libelleMode(s.mode) : null
  return (
    // Le cadre porte la gouttière de la page (`.page > *`) ; la carte s'aligne sur le texte.
    <div className="cadre">
      <section className="carte-fiche prix-service" aria-labelledby={`${id}-t`}>
        <h2 className="cf-grand-titre" id={`${id}-t`}>
          Prix et service
        </h2>
        {!s ? (
          <p className="muted">La commune ne figure pas dans l’observatoire des services d’eau (SISPEA).</p>
        ) : (
          <>
            {s.prix != null ? (
              <p>
                <b className="ps-prix">
                  {fmt.dec(s.prix, 2)}
                  {NBSP}€
                </b>{' '}
                le m³, toutes taxes comprises ({s.annee}, pour 120{NBSP}m³ par an)
              </p>
            ) : (
              <p className="muted">Aucun prix publié dans la dernière déclaration du service ({s.annee}).</p>
            )}
            <p className="ps-service">
              {s.nom}
              {mode && ` · ${mode}`}
            </p>
            {s.id && (
              <Link to={`/service/${s.id}`} className="link-arrow">
                Le service d’eau <span aria-hidden="true">→</span>
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  )
}

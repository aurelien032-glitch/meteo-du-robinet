import { useId } from 'react'
import { Link } from 'react-router-dom'
import Voyant from './Voyant'
import { ordreReseaux, tonBulletin, type ReseauBulletin } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { NBSP } from '../lib/instruments'
import { situationReseau, synthese } from '../lib/situations'
import { libelleMode, serviceDeCommune } from '../lib/sispea'
import type { SispeaDeptFile } from '../lib/types'

/**
 * « Qui la distribue ? », à côté du bulletin (maquette du 23/09). Le service d'eau de la commune, daté par sa
 * déclaration SISPEA : son prix est le dernier publié et ne suit pas l'année du contrôle sanitaire ; le mode de
 * gestion est un fait, dans un badge neutre. Puis les réseaux de l'année choisie, du plus défavorable au plus
 * favorable, chacun vers sa fiche, et leur distributeur selon le contrôle sanitaire. L'exploitant (SISPEA) et le
 * distributeur (ARS) sont deux noms de deux sources, définis dans la Méthode (#exploitant).
 */
export default function QuiDistribue({
  insee,
  dept,
  annee,
  reseaux,
  distributeurs,
  sansTitre = false,
}: {
  insee: string
  dept: string
  annee: string
  reseaux: ReseauBulletin[]
  /** distributeurs des réseaux (contrôle sanitaire), sans doublon */
  distributeurs: string[]
  /** dans une section repliée qui porte déjà le titre (« Qui distribue l'eau », fiche commune) */
  sansTitre?: boolean
}) {
  const id = useId()
  const sispea = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  const s = serviceDeCommune(sispea.data, insee)
  const n = reseaux.length
  return (
    <aside className="qui" aria-labelledby={sansTitre ? undefined : `${id}-t`} aria-label={sansTitre ? 'Qui distribue l’eau' : undefined}>
      {!sansTitre && (
        <h2 className="b-q" id={`${id}-t`}>
          Qui la distribue ?
        </h2>
      )}
      <section>
        <p className="qui-k">
          Service d’eau {s && <span className="b-y">SISPEA {s.annee}</span>}
        </p>
        {(sispea.data || sispea.error) && !s && <p className="muted">La commune ne figure pas dans l’observatoire des services d’eau (SISPEA).</p>}
        {s && (
          <>
            {s.id ? (
              <Link className="qui-lien" to={`/service/${s.id}`}>
                {s.nom} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <p className="qui-nom">{s.nom}</p>
            )}
            {(s.mode || s.exploitant) && (
              <p className="qui-ligne">
                {s.mode && <span className="badge neutre">{libelleMode(s.mode)}</span>}
                {s.exploitant && <span className="cap">Exploitant : {s.exploitant}</span>}
              </p>
            )}
            {s.prix != null && (
              <p className="qui-prix">
                <span className="qui-grand">
                  {fmt.dec(s.prix, 2)}
                  {NBSP}€
                </span>{' '}
                <span className="cap">le m³ toutes taxes comprises pour une consommation annuelle de 120 m³ (dernier prix publié, {s.annee})</span>
              </p>
            )}
          </>
        )}
      </section>
      <section>
        <p className="qui-k">
          {n > 1 ? `${n} réseaux de distribution` : 'Réseau de distribution'} <span className="b-y">en {annee}</span>
        </p>
        <ul className="qui-reseaux">
          {ordreReseaux(reseaux).map((r) => {
            const ton = tonBulletin(synthese([r.situation]))
            return (
              <li key={r.code}>
                <Voyant ton={ton === 'na' ? null : ton} taille={14} />
                <Link to={`/reseau/${r.code}`} className="wrap-any">
                  {r.nom.trim()}
                </Link>
                {/* Le code du réseau reste écrit au détail, sous son nom lisible (lib/nomsReseaux.ts). */}
                <span className="qui-code">{r.code}</span>
                {/* Statut de l'année, comme le tableau des réseaux. */}
                <span className="sr-only"> — {situationReseau(r.situation, annee).statut}</span>
              </li>
            )
          })}
        </ul>
        {/* Le nom que l'ARS enregistre, distinct de l'exploitant déclaré à SISPEA plus haut (relecture du 25/09 : « Exploitant
            : SEMM » et « Distribution : SOCIETE EAU DE MARSEILLE METROPOLE » se suivaient sans explication). */}
        {distributeurs.length > 0 && (
          <p className="cap">
            {distributeurs.length > 1 ? 'Distributeurs' : 'Distributeur'} (contrôle sanitaire) : {distributeurs.join(', ')}
          </p>
        )}
      </section>
      <p className="cap">
        <Link to="/methode#exploitant">Rôles du service, de l’exploitant et du distributeur</Link>
      </p>
    </aside>
  )
}

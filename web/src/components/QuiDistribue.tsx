import { useId } from 'react'
import { Link } from 'react-router-dom'
import Voyant from './Voyant'
import { etatTon, ordreReseaux, tonBulletin, type ReseauBulletin } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { NBSP } from '../lib/instruments'
import { synthese } from '../lib/situations'
import { serviceDeCommune } from '../lib/sispea'
import type { SispeaDeptFile } from '../lib/types'

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * « Qui la distribue ? », à côté du bulletin (maquette du 23/09). Le service d'eau de la commune, daté par sa
 * déclaration SISPEA : son prix est le dernier publié et ne suit pas l'année du contrôle sanitaire ; le mode de
 * gestion est un fait, dans un badge neutre. Puis les réseaux de l'année choisie, du plus défavorable au plus
 * favorable, chacun vers sa fiche, et qui les exploite.
 */
export default function QuiDistribue({
  insee,
  dept,
  annee,
  reseaux,
  exploitants,
}: {
  insee: string
  dept: string
  annee: string
  reseaux: ReseauBulletin[]
  /** distributeurs des réseaux (contrôle sanitaire), sans doublon */
  exploitants: string[]
}) {
  const id = useId()
  const sispea = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  const s = serviceDeCommune(sispea.data, insee)
  const n = reseaux.length
  return (
    <aside className="qui" aria-labelledby={`${id}-t`}>
      <h2 className="b-q" id={`${id}-t`}>
        Qui la distribue ?
      </h2>
      <section>
        <p className="qui-k">
          Service d’eau {s && <span className="b-y">SISPEA {s.annee}</span>}
        </p>
        {(sispea.data || sispea.error) && !s && <p className="muted">Commune absente de l’observatoire des services d’eau (SISPEA).</p>}
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
                {s.mode && <span className="badge neutre">{majuscule(s.mode)}</span>}
                {s.exploitant && <span className="cap">Exploitant : {s.exploitant}</span>}
              </p>
            )}
            {s.prix != null && (
              <p className="qui-prix">
                <span className="qui-grand">
                  {fmt.dec(s.prix, 2)}
                  {NBSP}€
                </span>{' '}
                <span className="cap">le m³ toutes taxes comprises, pour 120 m³ par an, en {s.annee} (dernier chiffre publié)</span>
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
                <span className="sr-only"> — {etatTon(ton)}</span>
              </li>
            )
          })}
        </ul>
        {exploitants.length > 0 && <p className="cap">Distribution : {exploitants.join(', ')}</p>}
      </section>
    </aside>
  )
}

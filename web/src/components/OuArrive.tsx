import { useId } from 'react'
import { Link } from 'react-router-dom'
import { accord } from '../lib/data'
import { useJson } from '../lib/hooks'
import { servicesDesCommunes } from '../lib/reseau'
import type { SispeaDeptFile } from '../lib/types'

/**
 * « Où arrive cette eau ? », à côté du bulletin d'un réseau (maquette du 23/09) : les communes qu'il dessert l'année
 * choisie (lib/reseau.ts), les services d'eau de ces communes — avec une note quand il y en a plusieurs — et qui
 * exploite le réseau, sous les noms que lui donne le contrôle sanitaire (distributeur, unité de gestion : Méthode,
 * #exploitant).
 */
export default function OuArrive({
  dept,
  annee,
  communes,
  noms,
  dist,
  uge,
  titre = true,
}: {
  dept: string
  annee: string
  communes: string[]
  /** code INSEE → nom en casse normale */
  noms: ReadonlyMap<string, string>
  dist: string | null
  uge: string | null
  /** le titre « Où arrive cette eau ? » ; sans lui quand la page en porte déjà un (fiche réseau) */
  titre?: boolean
}) {
  const id = useId()
  const sispea = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`).data
  const services = servicesDesCommunes(sispea, communes)
  const n = communes.length
  const triees = [...communes].sort((a, b) => (noms.get(a) ?? a).localeCompare(noms.get(b) ?? b, 'fr'))
  const gestion = uge && uge !== dist ? uge : null
  return (
    <aside className="qui" aria-labelledby={titre ? `${id}-t` : undefined} aria-label={titre ? undefined : 'Communes desservies, service d’eau et distributeur'}>
      {titre && (
        <h2 className="b-q" id={`${id}-t`}>
          Où arrive cette eau ?
        </h2>
      )}
      <section>
        <p className="qui-k">
          {n ? `${n} ${accord(n, 'commune desservie', 'communes desservies')}` : 'Aucune commune desservie'} <span className="b-y">en {annee}</span>
        </p>
        {n > 0 && (
          <ul className="qui-communes">
            {triees.map((c) => (
              <li key={c}>
                <Link to={`/commune/${c}`}>{noms.get(c) ?? c}</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="cap">Le bulletin de chaque commune retient la situation de ce réseau, et celle des autres s’il y en a.</p>
      </section>
      {services.length > 0 && (
        <section>
          <p className="qui-k">
            {services.length > 1 ? 'Services d’eau' : 'Service d’eau'} <span className="b-y">SISPEA</span>
          </p>
          {services.map((s) =>
            s.id ? (
              <p key={s.id} className="qui-service">
                <Link className="qui-lien" to={`/service/${s.id}`}>
                  {s.nom} <span aria-hidden="true">→</span>
                </Link>
                {s.entite && <span className="cap"> {s.entite}</span>}
              </p>
            ) : (
              <p key={s.nom} className="qui-nom">
                {s.nom}
              </p>
            ),
          )}
          {services.length > 1 && <p className="cap">Les communes de ce réseau relèvent de {services.length} services d’eau, chacun avec sa fiche.</p>}
        </section>
      )}
      {(dist || gestion) && (
        <section>
          <p className="qui-k">
            Exploitation <span className="b-y">(contrôle sanitaire)</span>
          </p>
          {dist && <p className="cap">Distributeur : {dist}</p>}
          {gestion && <p className="cap">Unité de gestion : {gestion}</p>}
          <p className="cap">
            <Link to="/methode#exploitant">Distributeur, unité de gestion : qui fait quoi</Link>
          </p>
        </section>
      )}
    </aside>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import FranceMap from './FranceMap'
import MapLegend from './MapLegend'
import Search from './Search'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import type { IndicDept } from '../lib/indicateursDept'
import { binaryScale } from '../lib/scale'
import { lireServices } from '../lib/servicesCommunes'
import { useCleTheme } from '../lib/theme'
import { communeDeRattachement, type CommuneIndexEntry, type SispeaCommunesFile } from '../lib/types'

/** Les noms de la SISPEA vont dans l'info-bulle en HTML : un « < » n'y doit rien casser. */
const html = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Vue communale d'un indicateur des services d'eau sur /carte (demande de l'auteur, 24/09) : chaque commune prend la
 * valeur du service qui la dessert (lib/servicesCommunes.ts), sur les paliers de la carte départementale, pour la
 * France entière ou un département. À côté de la carte d'un département, ses services d'eau classés : l'unité reste
 * le service, jamais un compte de communes. `annee` : année SISPEA des données, choisie au-dessus (règle de l'ordre
 * de l'année).
 */
export default function CarteCommunesServices({ ind, annee, dept }: { ind: IndicDept; annee: string | undefined; dept: string | null }) {
  const commune = ind.commune!
  const cle = useCleTheme()
  const nav = useNavigate()
  const [tout, setTout] = useState(false)
  useEffect(() => setTout(false), [dept, ind])
  const fichier = useJson<SispeaCommunesFile>(annee ? `sispea/communes/${annee}.json` : null)
  const geo = useJson<FeatureCollection>(dept ? `geo/communes/${dept}.json` : 'geo/communes-1000m.json').data
  // Le fond de la France entière ne porte que les codes : les noms viennent de l'index des communes.
  const index = useJson<CommuneIndexEntry[]>(dept ? null : 'communes.json').data
  const nomDe = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const lecture = useMemo(() => (fichier.data ? lireServices(fichier.data) : null), [fichier.data])
  // Une seule source pour les couleurs et la légende ; relue au changement de thème.
  const echelle = useMemo(() => (commune.binaire ? binaryScale() : ind.echelle()), [ind, commune, cle])
  const ecrire = useCallback((v: number) => (commune.binaire ? commune.binaire[v] : ind.ecrire(v)), [ind, commune])

  const colorOf = useCallback((p: Record<string, unknown>) => echelle.color(lecture?.valeur(String(p.code), commune.col) ?? null), [echelle, lecture, commune])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const code = String(p.code)
      // Arrondissement sans nom au fond de la France entière : le nom de sa commune (Paris, Marseille, Lyon).
      const nom = html((p.nom as string | undefined) ?? nomDe.get(code) ?? nomDe.get(communeDeRattachement(code)) ?? code)
      // Données pas encore chargées (ou en échec) : le nom seul, rien d'affirmé sur la commune.
      if (!lecture) return `<b>${nom}</b>`
      const s = lecture.service(code)
      if (!s) return `<b>${nom}</b><br>absente de l’observatoire SISPEA en ${annee}`
      const v = lecture.valeur(code, commune.col)
      return `<b>${nom}</b><br>${v == null ? 'pas de donnée' : ecrire(v)} · ${html(s.nom)}${s.entite ? ` (${html(s.entite)})` : ''}`
    },
    [lecture, commune, ecrire, nomDe, annee],
  )

  const liste = useMemo(() => (dept && lecture ? lecture.servicesDuDepartement(dept, commune.col, ind.pire) : null), [dept, lecture, commune, ind])
  const lignes = liste ? (tout ? liste.lignes : liste.lignes.slice(0, 15)) : []

  return (
    <div className="grid cols-map">
      <div>
        <FranceMap
          key={dept ? `communes-${dept}` : 'communes-france'}
          data={geo}
          colorOf={colorOf}
          labelOf={labelOf}
          onClick={(p) => nav(`/commune/${communeDeRattachement(String(p.code))}`, { viewTransition: true })}
          height={620}
          // Le fond de la France entière pèse 7 Mo : sans ce message, la carte resterait blanche le temps de l'attente.
          message={fichier.error ? `Pas de données communales pour ${annee}.` : lecture && geo ? null : 'Chargement des données…'}
          // Le libellé de la vue communale, pas celui du département (« pondéré », « médiane », « part de la population »).
          ariaLabel={
            dept ? `Carte des communes du département : ${commune.desc} ; ses services d'eau sont listés à côté` : `Carte de toutes les communes : ${commune.desc}`
          }
        />
        <MapLegend
          desc={`${commune.desc} (${commune.binaire ? '' : `${ind.unit}, `}${annee ?? '…'})`}
          scale={echelle}
          format={ind.borne}
          binaire={commune.binaire}
          noDataLabel="pas de donnée"
        />
        <p className="muted">
          {commune.note ?? 'Valeur déclarée par le service à l’observatoire SISPEA.'} Pour une commune desservie par plusieurs services, la valeur retenue est
          celle du service qui publie le prix, comme sur la fiche de la commune.
        </p>
      </div>
      <div className="card">
        <h3>Trouver une commune</h3>
        <Search />
        <p className="muted">Un clic sur une commune ouvre sa fiche.</p>
        {liste && (
          <>
            <h3>Services d’eau du département{liste.lignes.length ? ` (${liste.lignes.length})` : ''}</h3>
            {liste.lignes.length === 0 ? (
              <p className="muted">Aucun service du département ne publie cet indicateur pour {annee}.</p>
            ) : (
              <div className="table-scroll">
                <table className="data">
                  <caption className="sr-only">
                    Services d’eau du département en {annee} : {commune.binaire ? 'mode de gestion' : `valeur en ${ind.unit}`} et nombre de communes desservies ;
                    version textuelle de la carte
                  </caption>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th className={commune.binaire ? undefined : 'num'}>{commune.binaire ? 'Mode' : ind.unit}</th>
                      <th className="num">Communes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={l.service.id}>
                        <td>
                          <Link to={`/service/${l.service.id}`}>{l.service.nom}</Link>
                          {l.service.entite && <span className="muted"> · {l.service.entite}</span>}
                        </td>
                        <td className={commune.binaire ? undefined : 'num'}>{ecrire(l.v)}</td>
                        <td className="num">{fmt.int(l.communes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {liste.lignes.length > 15 && (
              <p className="muted">
                {tout ? fmt.nb(liste.lignes.length, 'service') : `15 premiers sur ${fmt.int(liste.lignes.length)}`}{' · '}
                <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
                  {tout ? 'voir les 15 premiers' : 'voir tous les services'}
                </button>
              </p>
            )}
            {liste.sansValeur > 0 && <p className="muted">{fmt.nb(liste.sansValeur, 'service n’a', 'services n’ont')} pas de donnée pour cet indicateur en {annee}.</p>}
          </>
        )}
      </div>
    </div>
  )
}

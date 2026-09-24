import { Link } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import CarteDepartements, { type CarteSvg } from '../components/CarteDepartements'
import Chargement from '../components/Chargement'
import LireBulletin from '../components/LireBulletin'
import Search, { PictoType } from '../components/Search'
import Voyant from '../components/Voyant'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { TEXTES_FAMILLES } from '../lib/instruments'
import type { TypeResultat } from '../lib/recherche'
import { FAMILLES_SITU, nonConformes, reseauxAnalyses, type FamilleSitu, type Repartition } from '../lib/situations'
import { yearLabel, type MetaFile, type NationalFile, type ParamsFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

/** situations/national.json et situations/depts.json : répartitions par année (pipeline/robinet/situations.py). */
type Repartitions = Partial<Record<FamilleSitu, Repartition>>
type SituationsNational = Record<string, Repartitions>
type SituationsDepts = Record<string, Record<string, Repartitions>>

/** Exemples de fiches, un par cas de la maquette : conforme avec réserve, pesticides, PFAS en restriction, consigne. */
const EXEMPLES: { type: TypeResultat; lien: string; nom: string; genre?: string }[] = [
  { type: 'commune', lien: '/commune/35238', nom: 'Rennes' },
  { type: 'commune', lien: '/commune/51454', nom: 'Reims' },
  { type: 'commune', lien: '/commune/50129', nom: 'Cherbourg-en-Cotentin' },
  { type: 'commune', lien: '/commune/31187', nom: 'Fonsorbes' },
  { type: 'service', lien: '/service/77654', nom: 'Eau du Bassin Rennais', genre: 'service d’eau' },
  { type: 'reseau', lien: '/reseau/050000645', nom: 'Asselinerie', genre: 'réseau' },
]

const part = (r: Repartition | undefined, f: FamilleSitu) => (r && reseauxAnalyses(r) ? nonConformes(r, f) / reseauxAnalyses(r) : null)

/**
 * Accueil (maquette « vigilance + instruments » du 23/09). Ordre voulu par l'auteur : d'abord la recherche, qui ne
 * dépend d'aucune année ; puis « La France en {année} », ouverte par la barre d'année qui gouverne tout ce qui suit
 * — chiffres, carte, familles, paramètres ; enfin « Lire un bulletin », valable pour toutes les années. Chiffres
 * agrégés sans couleur : le sémaphore ne juge qu'un réseau.
 */
export default function Home() {
  const meta = useJson<MetaFile>('meta.json').data
  const nat = useJson<NationalFile>('national.json').data
  const params = useJson<ParamsFile>('params.json').data
  const situNat = useJson<SituationsNational>('situations/national.json').data
  const situDepts = useJson<SituationsDepts>('situations/depts.json').data
  const carte = useJson<CarteSvg>('geo/departements-svg.json').data
  const [y, setYear] = useYear(meta)

  const tete = (
    <section className="accueil-tete" aria-labelledby="accueil-titre">
      <div className="accueil-intro">
        <h1 id="accueil-titre">Quelle eau coule à votre robinet ?</h1>
        <p className="lead">Le bulletin de chaque commune et de chaque réseau d’eau potable, établi à partir du contrôle sanitaire et lu selon la méthode des bilans officiels.</p>
      </div>
      <div className="accueil-recherche">
        <p className="accueil-recherche-titre">Commune, syndicat ou réseau</p>
        <Search placeholder="Nom, ou code INSEE, SISPEA, de réseau" />
        <p className="accueil-aide">Conformité de l’eau distribuée, avis de l’ARS, service d’eau, ressource.</p>
        <div className="accueil-exemples">
          <span>Exemples</span>
          <ul>
            {EXEMPLES.map((e) => (
              <li key={e.lien}>
                <Link to={e.lien} className="exemple" viewTransition>
                  <PictoType type={e.type} />
                  <span>{e.nom}</span>
                  {e.genre && <span className="exemple-genre">{e.genre}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )

  const ny = y ? nat?.annees[String(y)] : undefined
  if (!meta || !nat || !params || !situNat || !y || !ny)
    return (
      <div className="page accueil">
        {tete}
        <Chargement texte="Chargement des chiffres de la France…" />
      </div>
    )

  const annee = yearLabel(meta, y)
  const plv = ny.plv
  // Gardé contre un millésime tout juste ouvert, encore sans prélèvement évalué (0/0 s'écrirait NaN).
  const pctBact = plv.ne_bact ? 100 * (1 - plv.nc_bact / plv.ne_bact) : null
  const pctChim = plv.ne_chim ? 100 * (1 - plv.nc_chim / plv.ne_chim) : null
  const france = situNat[String(y)] ?? {}
  const toutes = france.toutes
  const partToutes = part(toutes, 'toutes')
  const familles = FAMILLES_SITU.map((f) => ({ f, part: part(france[f], f), n: france[f] ? nonConformes(france[f]!, f) : 0, total: france[f] ? reseauxAnalyses(france[f]!) : 0 }))
    .filter((x) => x.part != null)
    .sort((a, b) => b.part! - a.part!)
  const partMax = Math.max(...familles.map((x) => x.part!), 0.0001)

  return (
    <div className="page accueil">
      {tete}

      <section className="accueil-france" aria-label={`La France en ${annee}`}>
        <BarreAnnee
          titre={`La France en ${annee}`}
          titreSection
          note="L’année choisie vaut pour les chiffres, la carte, les familles et les paramètres ci-dessous."
          annees={anneesFiche(meta)}
          annee={y}
          onChange={setYear}
        />
        <p className="accueil-contexte">
          {fmt.int(plv.n)} prélèvements du contrôle sanitaire, dans {fmt.int(ny.n_communes)} communes et {fmt.int(ny.n_reseaux)} réseaux de distribution.
        </p>
        <dl className="chiffres">
          <div className="chiffre">
            <dt className="avec-voyant">
              <Voyant ton="good" taille={16} />
              <span>des prélèvements conformes en bactériologie</span>
            </dt>
            <dd className="chiffre-valeur">{fmt.pct(pctBact, 1)}</dd>
            <dd className="chiffre-detail">{fmt.int(plv.nc_bact)} non conformes</dd>
          </div>
          <div className="chiffre">
            <dt className="avec-voyant">
              <Voyant ton="good" taille={16} />
              <span>des prélèvements conformes en chimie</span>
            </dt>
            <dd className="chiffre-valeur">{fmt.pct(pctChim, 1)}</dd>
            <dd className="chiffre-detail">{fmt.int(plv.nc_chim)} non conformes</dd>
          </div>
          <div className="chiffre">
            <dt className="avec-voyant">
              <Voyant ton="warn" taille={16} />
              <span>des réseaux non conformes, toutes familles</span>
            </dt>
            <dd className="chiffre-valeur">{partToutes == null ? '–' : fmt.pct(100 * partToutes, 1)}</dd>
            <dd className="chiffre-detail">{toutes ? `${fmt.int(nonConformes(toutes, 'toutes'))} sur ${fmt.int(reseauxAnalyses(toutes))} réseaux analysés` : ''}</dd>
          </div>
          <div className="chiffre">
            <dt className="avec-voyant">
              <Voyant ton="bad" taille={16} />
              <span>réseaux sous restriction ou consigne de l’ARS</span>
            </dt>
            <dd className="chiffre-valeur">{toutes ? fmt.int(toutes[2]) : '–'}</dd>
            <dd className="chiffre-detail">{toutes ? `sur ${fmt.int(reseauxAnalyses(toutes))} réseaux analysés` : ''}</dd>
          </div>
        </dl>

        <h3 className="accueil-sous-titre">Réseaux non conformes, par département</h3>
        {carte && situDepts?.[String(y)] ? (
          <CarteDepartements carte={carte} depts={situDepts[String(y)]} france={toutes} annee={annee} />
        ) : (
          <Chargement texte="Chargement de la carte…" />
        )}

        <div className="accueil-duo">
          <div>
            <h3>Réseaux non conformes, par famille</h3>
            <p className="muted">Selon la méthode du bilan officiel de chaque famille, en {annee}.</p>
            <ul className="barres">
              {familles.map((x) => (
                <li key={x.f}>
                  <span className="barre-nom">{TEXTES_FAMILLES[x.f].titre}</span>
                  <span className="barre-piste" aria-hidden="true">
                    <span className="barre-trait" style={{ width: `${(100 * x.part!) / partMax}%` }} />
                  </span>
                  <span className="barre-valeur">
                    {fmt.pct(100 * x.part!, 1)} <small>{fmt.int(x.n)} sur {fmt.int(x.total)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Paramètres le plus souvent au-dessus de la limite</h3>
            <p className="muted">Nombre d’analyses au-dessus de la limite de qualité, en {annee}.</p>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Paramètre</th>
                    <th scope="col" className="num">
                      Dépassements
                    </th>
                    <th scope="col" className="num">
                      Analyses
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ny.top.slice(0, 8).map((t) => {
                    const info = params.params[t.p]
                    return (
                      <tr key={t.p}>
                        <td>
                          {info?.l ?? t.p}
                          <br />
                          <span className="muted">{info ? params.familles[info.f] : ''}</span>
                        </td>
                        <td className="num">{fmt.int(t.nd)}</td>
                        <td className="num">{fmt.int(t.n)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="source">
          Source : contrôle sanitaire SISE-Eaux, ministère chargé de la Santé, via data.gouv.fr. Les bilans officiels pondèrent par la population desservie par chaque réseau, qui n’est pas
          publiée en données ouvertes : le site compte des réseaux.
        </p>
      </section>

      <LireBulletin />
    </div>
  )
}

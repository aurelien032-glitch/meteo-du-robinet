import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import { AvisDeLaCarte, ChiffreCarte, dateMoment, MesureSujet, RechercheSujet } from '../components/Sujet'
import TableauDeptsTri, { type Colonne } from '../components/TableauDeptsTri'
import { EFFECTIF_MIN } from '../lib/classement'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson, useJsonAll } from '../lib/hooks'
import { estPartiel } from '../lib/situations'
import { analysesParAnnee, analysesParDept, PAGES_THEMES, PARAMS_CANALISATIONS, phraseAvisCause, type CompteAnalyses, type LigneAnalyses } from '../lib/sujets'
import { usePageTitle } from '../lib/title'
import { bilanDe, defaultYear, yearLabel, type AvisNationalFile, type MetaFile, type SeriesFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

const periodeDe = (a: string) => (estPartiel(a) ? `depuis le 1er janvier ${a}` : `en ${a}`)
const partAnalyses = (c: CompteAnalyses | undefined) => (c && c.n ? fmt.pct((100 * c.nd) / c.n, 1) : '–')

/**
 * « Plomb et canalisations » (refonte, lot 4, règle de l'auteur du 2026-10-05) : la limite du plomb d'après l'arrêté du
 * 11 janvier 2007 modifié, et les résultats publiés du plomb, du cuivre et du nickel, que le site écarte du jugement des
 * réseaux comme les synthèses de l'ARS (lib/situations.ts, CANALISATIONS). Les résultats sont présentés sans être jugés :
 * aucun voyant, aucune carte colorée, aucun conseil pratique ; un tableau des départements alphabétique, tri au choix.
 */
export default function Plomb() {
  const page = PAGES_THEMES.plomb
  usePageTitle(page.titre, page.description)
  const meta = useJson<MetaFile>('meta.json').data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  const series = useJsonAll<SeriesFile>(PARAMS_CANALISATIONS.map((p) => `series/${p.code}.json`))
  const { names } = useDepartements()
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  const nom = useCallback((dd: string) => names.get(dd) ?? dd, [names])

  const parAnnee = useMemo(() => (series.data ?? []).map((s) => analysesParAnnee(s)), [series.data])
  const plomb = series.data?.[0]
  const lignes = useMemo(() => (plomb && y ? analysesParDept(plomb, y, nom) : []), [plomb, y, nom])
  const colonnes = useMemo<Colonne<LigneAnalyses>[]>(
    () => [
      { cle: 'n', titre: 'Analyses', num: true, quoi: 'le nombre d’analyses', valeur: (l) => l.n, cellule: (l) => fmt.int(l.n) },
      { cle: 'nd', titre: 'Au-dessus de 10 µg/L', num: true, quoi: 'le nombre de résultats au-dessus de 10 µg/L', valeur: (l) => l.nd, cellule: (l) => fmt.int(l.nd) },
      {
        cle: 'part',
        titre: 'Part des analyses',
        num: true,
        quoi: 'la part des analyses au-dessus de 10 µg/L',
        valeur: (l) => l.part,
        classable: (l) => l.classable,
        cellule: (l) => (
          <>
            {l.part == null ? '–' : fmt.pct(100 * l.part, 1)}
            {!l.classable && (
              <span className="muted">
                {' '}
                <abbr title={`Part calculée sur moins de ${EFFECTIF_MIN} analyses : hors des tris`}>(hors tri)</abbr>
              </span>
            )}
          </>
        ),
      },
    ],
    [],
  )

  if (!meta) return <Chargement reserve />
  const enCours = String(defaultYear(meta) ?? '')
  // Le bilan suit la barre d'année, comme le tableau des départements : une seule année par page (parcours, 2026-10-06).
  const anneeBilan = String(y ?? defaultYear(meta) ?? '')
  const annees = meta.annees.map(String)
  const pl = parAnnee[0]
  const moment = pl?.get(enCours)
  const bilan = pl?.get(anneeBilan)

  return (
    <div className="page sujet">
      <p className="eyebrow">Sujets</p>
      <Crumbs items={[{ label: 'Sujets', to: '/themes' }, { label: page.titre }]} />
      <h1>{page.titre}</h1>

      <div className="sujet-tete">
        <MesureSujet sujet="plomb" />
        <RechercheSujet texte="Les résultats du plomb, du cuivre et du nickel d’une commune figurent dans le détail de ses analyses, avec la remarque « hors du jugement du réseau »." />
      </div>

      <div className="accueil-cartes">
        <section className="carte-fiche accueil-carte" aria-labelledby="t-moment">
          <div className="cf-tete">
            <p className="cf-sur">En ce moment</p>
            <p className="cf-date">{dateMoment(enCours, avis)}</p>
          </div>
          <h2 className="cf-grand-titre" id="t-moment">
            Analyses du plomb {periodeDe(enCours)}
          </h2>
          {!series.data ? (
            <Chargement texte="Chargement des analyses…" />
          ) : moment ? (
            <ChiffreCarte n={moment.nd} texte={`${moment.nd > 1 ? 'résultats' : 'résultat'} au-dessus de 10 µg/L, sur ${fmt.nb(moment.n, 'analyse')} du plomb publiées.`} />
          ) : (
            <p className="cf-texte">Aucune analyse du plomb n’est publiée {periodeDe(enCours)}.</p>
          )}
          <AvisDeLaCarte phrase={phraseAvisCause(avis?.causes[enCours], 'plomb', periodeDe(enCours))} avis={avis} annee={enCours} />
        </section>
      </div>

      <section className="carte-fiche" aria-labelledby="t-annees">
        <h2 className="cf-grand-titre" id="t-annees">
          Analyses par année
        </h2>
        {!series.data ? (
          <Chargement texte="Chargement des analyses…" />
        ) : (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Analyses du plomb, du cuivre et du nickel, et résultats au-dessus de la limite de qualité, par année</caption>
              <thead>
                <tr>
                  <th>Année</th>
                  {PARAMS_CANALISATIONS.map((p) => (
                    <th key={p.code} className="num wrap">
                      {p.nom} <span className="unite">au-dessus / analyses</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {annees.map((a) => (
                  <tr key={a}>
                    <td>{yearLabel(meta, a)}</td>
                    {PARAMS_CANALISATIONS.map((p, i) => {
                      const c = parAnnee[i]?.get(a)
                      return (
                        <td key={p.code} className="num">
                          {c ? `${fmt.int(c.nd)} / ${fmt.int(c.n)}` : '–'}
                          {c && c.n > 0 && <span className="muted"> ({partAnalyses(c)})</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cap">Limites de qualité au robinet : plomb 10 µg/L, cuivre 2 mg/L, nickel 20 µg/L. L’année en cours est incomplète.</p>
      </section>

      <section className="sujet-carte" aria-labelledby="t-depts-plomb">
        <h2 id="t-depts-plomb">Bilan de l’année, par département</h2>
        <BarreAnnee
          titre="Année du bilan"
          note="Elle vaut pour le bilan et le tableau des départements ci-dessous ; « En ce moment » porte sur l’année en cours."
          annees={anneesFiche(meta)}
          annee={y}
          onChange={setYear}
        />
          <section className="carte-fiche accueil-carte" aria-labelledby="t-bilan-sujet">
            <div className="cf-tete">
              <p className="cf-sur">{bilanDe(anneeBilan, estPartiel(anneeBilan))}</p>
              {bilan && <p className="cf-date">{fmt.nb(bilan.n, 'analyse')} du plomb</p>}
            </div>
            <h2 className="cf-grand-titre" id="t-bilan-sujet">
              {bilan ? `${partAnalyses(bilan)} des analyses du plomb au-dessus de 10 µg/L` : bilanDe(anneeBilan, estPartiel(anneeBilan))}
            </h2>
            {!series.data ? (
              <Chargement texte="Chargement des analyses…" />
            ) : (
              <ul className="sujet-classes sans-couleur">
                {PARAMS_CANALISATIONS.map((p, i) => {
                  const c = parAnnee[i]?.get(anneeBilan)
                  return (
                    <li key={p.code}>
                      <span>{p.nom}</span>
                      <span className="sc-nb">{c ? `${fmt.int(c.nd)} sur ${fmt.int(c.n)}` : '–'}</span>
                      <span className="sc-part">{partAnalyses(c)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="cap">
              Résultats au-dessus de la limite de qualité, sur le nombre d’analyses publiées dans l’année. Une analyse au robinet porte sur un point de prélèvement ; ces
              résultats ne jugent pas le réseau.
            </p>
          </section>
        <section className="carte-fiche" aria-label="Tableau des départements">
          <p className="cf-texte">
            Par ordre alphabétique ; un tri est proposé. Les résultats sont présentés tels qu’ils sont publiés, sans jugement des réseaux ni des départements.
          </p>
          {series.data ? (
            <TableauDeptsTri
              lignes={lignes}
              colonnes={colonnes}
              unite="analyses"
              carte={false}
              legende={`Analyses du plomb par département ${y ? periodeDe(String(y)) : ''}, par ordre alphabétique ou selon le tri choisi`}
              csv={{
                sujet: 'plomb',
                annee: y ?? '',
                entetes: ['Code du département', 'Département', 'Année', 'Analyses du plomb', 'Résultats au-dessus de 10 µg/L', 'Part des analyses au-dessus de 10 µg/L (%)', 'Part retenue dans les tris (10 analyses au moins)'],
                ligne: (l) => [l.dd, l.nom, String(y), l.n, l.nd, l.part == null ? null : Math.round(l.part * 1000) / 10, l.classable ? 'oui' : 'non'],
              }}
            />
          ) : (
            <Chargement texte="Chargement des départements…" />
          )}
        </section>
      </section>

      <footer className="france-pied">
        <p>
          Sources et méthode : <Link to="/methode#hors-jugement">résultats hors du jugement des réseaux</Link> · <Link to="/methode#classements">règle des classements</Link> ·{' '}
          <Link to="/themes/metaux">métaux et minéraux</Link>
        </p>
        <p className="source">Source : contrôle sanitaire de l’eau potable (SISE-Eaux, ministère chargé de la Santé, agences régionales de santé) ; conclusions de l’ARS pour les avis.</p>
      </footer>
    </div>
  )
}

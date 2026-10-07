import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { GROUPES_HG, part100 } from '../lib/horsGrille'
import type { HgGroupe, HorsGrilleFile } from '../lib/types'

/**
 * Substances analysées sans limite ni référence de qualité, dans un département (choix de l'auteur, 26/09 : les liens
 * et l'encart de /hors-grille ouvraient la fiche sans rien en dire). Pour chaque groupe, les communes où il a été
 * recherché, puis quantifié, l'année de la fiche ; le groupe regardé sur /hors-grille est marqué. Ni conformité ni
 * couleur de jugement : sans limite, pas de dépassement.
 */
export default function DeptHorsGrille({ dd, annee, groupe }: { dd: string; annee: string; groupe: HgGroupe | null }) {
  const hg = useJson<HorsGrilleFile>('horsgrille.json').data
  if (!hg) return null
  if (!hg.annees.includes(annee)) return <p className="muted">Pas de données sur ces substances en {annee}.</p>
  const lignes = GROUPES_HG.map((g) => ({ g, r: hg.depts[g]?.[annee]?.[dd] ?? null }))
  // Communes où l'eau a été prélevée dans l'année : le même total pour chaque groupe recherché.
  const tot = lignes.find((l) => l.r)?.r?.[0]
  const lien = (g: HgGroupe) => `/hors-grille?groupe=${g}&annee=${annee}`
  return (
    <div className="card">
      <h2>Substances sans limite de qualité · {annee}</h2>
      <p className="muted">
        Ces substances n’ont pas de limite de qualité réglementaire : leurs résultats ne sont comparés à aucun seuil.
        {tot
          ? ` Le tableau indique, pour chaque groupe, le nombre de communes où il a été recherché en ${annee} et celles où il a été quantifié, parmi les ${fmt.nb(tot, 'commune')} du département ayant fait l’objet d’au moins un prélèvement.`
          : ` Aucun de ces groupes n’a été recherché dans le département en ${annee}.`}
      </p>
      {tot != null && (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Groupes de substances sans limite de qualité : nombre de communes du département où chaque groupe a été recherché en {annee} et nombre de celles où il a été quantifié</caption>
            <thead>
              <tr>
                <th>Groupe de substances</th>
                <th className="num">Recherché</th>
                <th className="num">Quantifié</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(({ g, r }) => (
                <tr key={g} className={g === groupe ? 'on' : undefined} aria-current={g === groupe ? 'true' : undefined}>
                  <td>
                    <Link to={lien(g)}>{hg.groupes[g]}</Link>
                    {!r && <span className="muted"> · jamais recherché</span>}
                  </td>
                  <td className="num">
                    {r ? (
                      <>
                        <b>{fmt.int(r[1])}</b> <span className="muted">({part100(r[1], r[0], true)})</span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="num">{r ? fmt.int(r[2]) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="source">
        Contrôle sanitaire SISE-Eaux. Un groupe est compté comme recherché dans une commune lorsqu’au moins une analyse a été
        réalisée dans l’année sur un réseau qui la dessert, et comme quantifié lorsqu’au moins un résultat dépasse le seuil de
        quantification. Le détail par substance et les résultats nationaux figurent sur la page{' '}
        <Link to={lien(groupe ?? 'perchlorate')}>Substances sans limite de qualité</Link> · <Link to="/methode#hors-grille">Méthode</Link>.
      </div>
    </div>
  )
}

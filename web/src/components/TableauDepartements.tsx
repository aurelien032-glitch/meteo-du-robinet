import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LETTRES_ARS } from '../lib/bilan'
import { EFFECTIF_MIN } from '../lib/classement'
import { fmt } from '../lib/data'
import { ariaSort, csvFrance, effectifCD, nomFichierCsv, pctPartCD, phraseTri, trierFrance, triSuivant, type CleTri, type LigneFrance, type TriFrance } from '../lib/france'
import { estPartiel } from '../lib/situations'
import { RANGEES_REPLIEES } from '../lib/tableauDepts'

/** Télécharge le tableau, dans l'ordre affiché, en CSV produit dans le navigateur (lib/france.ts, csvFrance). */
function telecharger(lignes: readonly LigneFrance[], annee: string | number) {
  const blob = new Blob([csvFrance(lignes, annee)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nomFichierCsv(annee, new Date())
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

/**
 * Tableau « Les départements » (refonte, lot 3) : version textuelle de la carte des départements, par ordre alphabétique,
 * sans palmarès ; le visiteur peut trier par part (en-têtes à bouton, `aria-sort`), les parts calculées sur moins de
 * EFFECTIF_MIN réseaux allant en fin de liste (règle des classements, lib/classement.ts). Colonnes A, B, C et D quand la
 * place le permet (requête de conteneur) ; toutes figurent dans le fichier CSV.
 */
export default function TableauDepartements({
  lignes,
  annee,
  lien,
  selection,
  onSurvol,
  hauteur = true,
}: {
  /** lignes dans l'ordre alphabétique (lignesFrance) */
  lignes: readonly LigneFrance[]
  annee: string | number
  /** adresse du lien de chaque département */
  lien: (dd: string) => string
  /** département mis en évidence (survol de la carte) */
  selection?: string | null
  onSurvol?: (dd: string | null) => void
  /** tableau replié sur ses premières rangées, déroulé à la demande (plus de défilement interne, critique UX du 05/10) */
  hauteur?: boolean
}) {
  const [tri, setTri] = useState<TriFrance>({ cle: 'nom', desc: false })
  const [tout, setTout] = useState(!hauteur)
  const tries = useMemo(() => trierFrance(lignes, tri), [lignes, tri])
  const horsTri = lignes.filter((l) => l.part != null && !l.classable).length
  const partiel = estPartiel(annee)
  const entete = (cle: CleTri, texte: string, className?: string) => (
    <th scope="col" className={className} aria-sort={ariaSort(tri, cle)}>
      <button type="button" className="tri" onClick={() => setTri(triSuivant(tri, cle))}>
        {texte}
        <span aria-hidden="true">{tri.cle === cle ? (tri.desc ? ' ▼' : ' ▲') : ' ↕'}</span>
      </button>
    </th>
  )
  return (
    <div className="tableau-france-boite">
      <p className="sr-only" role="status">
        {phraseTri(tri)}
      </p>
      <div className="table-scroll">
        <table className="data tableau-france">
          <caption className="sr-only">
            Les départements, par ordre alphabétique ou selon le tri choisi : part des réseaux notés C ou D {partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`}, nombre de
            réseaux notés C ou D sur le nombre de réseaux notés, puis réseaux de chaque note
          </caption>
          <thead>
            <tr>
              {entete('nom', 'Département', 'fige')}
              {entete('part', 'C ou D', 'num')}
              <th scope="col" className="num">
                Réseaux
              </th>
              {LETTRES_ARS.map((l) => (
                <th key={l} scope="col" className="num col-lettre">
                  <span className="sr-only">Note </span>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(tout ? tries : tries.slice(0, RANGEES_REPLIEES)).map((l) => (
              <tr key={l.dd} className={selection === l.dd ? 'on' : undefined} onMouseEnter={onSurvol && (() => onSurvol(l.dd))} onMouseLeave={onSurvol && (() => onSurvol(null))}>
                <td className="fige">
                  <Link to={lien(l.dd)}>
                    {l.nom} ({l.dd})
                  </Link>
                </td>
                <td className="num">{l.part == null ? '–' : pctPartCD(l.part)}</td>
                <td className="num">
                  {l.comptes.classes ? effectifCD(l.comptes) : '–'}
                  {l.part != null && !l.classable && (
                    <span className="muted">
                      {' '}
                      <abbr title={`Part calculée sur moins de ${EFFECTIF_MIN} réseaux notés : hors des tris`}>(hors tri)</abbr>
                    </span>
                  )}
                </td>
                {LETTRES_ARS.map((x) => (
                  <td key={x} className="num col-lettre">
                    {fmt.int(l.comptes[x])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hauteur && tries.length > RANGEES_REPLIEES ? (
        <p className="tableau-france-tout">
          <button type="button" className="btn" aria-expanded={tout} onClick={() => setTout(!tout)}>
            {tout ? `Afficher les ${RANGEES_REPLIEES} premiers départements` : `Afficher les ${fmt.int(tries.length)} départements`}
          </button>
        </p>
      ) : null}
      <p className="cap tableau-france-etroit">Sur un écran étroit, les colonnes A à D sont masquées ; le fichier CSV les contient.</p>
      {horsTri > 0 && (
        <p className="cap">
          {horsTri > 1
            ? `${fmt.int(horsTri)} départements sont signalés « hors tri » : leur part repose sur moins de ${EFFECTIF_MIN} réseaux notés, qui ne sont pas tous les réseaux du département. Ils gardent leur couleur sur la carte et passent en fin de liste quand le tableau est trié par part.`
            : `Un département est signalé « hors tri » : sa part repose sur moins de ${EFFECTIF_MIN} réseaux notés, qui ne sont pas tous les réseaux du département. Il garde sa couleur sur la carte et passe en fin de liste quand le tableau est trié par part.`}{' '}
          <Link to="/methode#classements">Règle des classements</Link>.
        </p>
      )}
      <p className="tableau-france-csv">
        <button type="button" className="btn" onClick={() => telecharger(tries, annee)}>
          Télécharger le tableau (CSV)
        </button>
        <span className="cap">Tous les départements, avec les réseaux de chaque note ; séparateur point-virgule.</span>
      </p>
    </div>
  )
}

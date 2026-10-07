import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EFFECTIF_MIN } from '../lib/classement'
import { fmt } from '../lib/data'
import { ariaTri, csvTableau, nomFichierSujet, phraseTriSujet, TRI_ALPHABETIQUE, trierLignes, triApres, type CleTriable, type LigneDept, type Tri, RANGEES_REPLIEES } from '../lib/tableauDepts'

/** Colonne du tableau : son titre, sa cellule ; triable si elle a une valeur. */
export interface Colonne<T> extends Partial<CleTriable<T>> {
  cle: string
  titre: ReactNode
  cellule: (l: T) => ReactNode
  /** nom de la colonne dans la phrase d'état du tri (« la part des réseaux non conformes ») */
  quoi?: string
  num?: boolean
  /** classe CSS de l'en-tête et des cellules (« col-lettre » : colonne effacée quand la place manque, gardée dans le CSV) */
  classe?: string
}

/** Télécharge un CSV produit dans le navigateur. */
function telecharger(contenu: string, nom: string) {
  const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nom
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

/**
 * Tableau des départements d'une page de sujet (refonte, lot 4) : version textuelle de la carte, dans l'ordre
 * alphabétique, sans palmarès ; le visiteur peut trier par une colonne (en-têtes à bouton, `aria-sort`), les parts trop
 * peu étayées allant en fin de liste (lib/tableauDepts.ts, règle des classements). Téléchargement CSV des lignes, dans
 * l'ordre affiché.
 */
export default function TableauDeptsTri<T extends LigneDept>({
  lignes,
  colonnes,
  lien,
  legende,
  csv,
  selection,
  onSurvol,
  unite = 'réseaux analysés',
  carte = true,
}: {
  lignes: readonly T[]
  colonnes: readonly Colonne<T>[]
  lien?: (dd: string) => string
  /** légende du tableau, lue par les lecteurs d'écran */
  legende: string
  csv?: { sujet: string; annee: string | number; entetes: readonly string[]; ligne: (l: T) => (string | number | null)[]; note?: string }
  selection?: string | null
  onSurvol?: (dd: string | null) => void
  /** unités de la règle des classements (« réseaux analysés », « analyses ») */
  unite?: string
  /** le tableau accompagne une carte (la note des parts hors tri le dit) */
  carte?: boolean
}) {
  const [tri, setTri] = useState<Tri>(TRI_ALPHABETIQUE)
  // Tableau déroulé, sans défilement interne (critique UX du 2026-10-05 : un cadre de quinze rangées piégeait le
  // défilement sur téléphone) : les premières rangées, puis toutes à la demande.
  const [tout, setTout] = useState(false)
  const triables = useMemo(() => colonnes.filter((c): c is Colonne<T> & CleTriable<T> => !!c.valeur), [colonnes])
  const tries = useMemo(() => trierLignes(lignes, tri, triables), [lignes, tri, triables])
  const colTriee = triables.find((c) => c.cle === tri.cle)
  const horsTri = triables.some((c) => c.classable) ? lignes.filter((l) => triables.some((c) => c.classable && c.valeur!(l) != null && !c.classable(l))).length : 0
  const bouton = (cle: string, texte: ReactNode) => (
    <button type="button" className="tri" onClick={() => setTri(triApres(tri, cle))}>
      {texte}
      <span aria-hidden="true">{tri.cle === cle ? (tri.desc ? ' ▼' : ' ▲') : ' ↕'}</span>
    </button>
  )
  return (
    <div className="tableau-france-boite">
      <p className="sr-only" role="status">
        {phraseTriSujet(tri, colTriee?.quoi ?? 'la valeur choisie', !!colTriee?.classable, unite)}
      </p>
      <div className="table-scroll">
        <table className="data tableau-france">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr>
              <th scope="col" className="fige" aria-sort={ariaTri(tri, 'nom')}>
                {bouton('nom', 'Département')}
              </th>
              {colonnes.map((c) => (
                <th key={c.cle} scope="col" className={[c.num && 'num', c.classe].filter(Boolean).join(' ') || undefined} aria-sort={c.valeur ? ariaTri(tri, c.cle) : undefined}>
                  {c.valeur ? bouton(c.cle, c.titre) : c.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(tout ? tries : tries.slice(0, RANGEES_REPLIEES)).map((l) => (
              <tr key={l.dd} className={selection === l.dd ? 'on' : undefined} onMouseEnter={onSurvol && (() => onSurvol(l.dd))} onMouseLeave={onSurvol && (() => onSurvol(null))}>
                <td className="fige">
                  {lien ? (
                    <Link to={lien(l.dd)}>
                      {l.nom} ({l.dd})
                    </Link>
                  ) : (
                    `${l.nom} (${l.dd})`
                  )}
                </td>
                {colonnes.map((c) => (
                  <td key={c.cle} className={[c.num && 'num', c.classe].filter(Boolean).join(' ') || undefined}>
                    {c.cellule(l)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tries.length > RANGEES_REPLIEES && (
        <p className="tableau-france-tout">
          <button type="button" className="btn" aria-expanded={tout} onClick={() => setTout(!tout)}>
            {tout ? `Afficher les ${RANGEES_REPLIEES} premiers départements` : `Afficher les ${fmt.int(tries.length)} départements`}
          </button>
        </p>
      )}
      <p className="cap tableau-france-etroit">Sur un écran étroit, certaines colonnes sont masquées ; le fichier CSV les contient toutes.</p>
      {horsTri > 0 && (
        <p className="cap">
          {horsTri > 1 ? `${fmt.int(horsTri)} départements sont signalés` : 'Un département est signalé'} « hors tri » : {horsTri > 1 ? 'leur' : 'sa'} part repose sur moins de{' '}
          {EFFECTIF_MIN} {unite}
          {unite.startsWith('réseaux') ? ', qui ne sont pas tous les réseaux du département' : ''}.{' '}
          {carte ? `${horsTri > 1 ? 'Ils gardent leur' : 'Il garde sa'} couleur sur la carte et ` : `${horsTri > 1 ? 'Ils' : 'Il'} `}
          {horsTri > 1 ? 'passent' : 'passe'} en fin de liste quand le tableau est trié par part.{' '}
          <Link to="/methode#classements">Règle des classements</Link>.
        </p>
      )}
      {csv && (
        <p className="tableau-france-csv">
          <button type="button" className="btn" onClick={() => telecharger(csvTableau(csv.entetes, tries.map(csv.ligne)), nomFichierSujet(csv.sujet, csv.annee, new Date()))}>
            Télécharger le tableau (CSV)
          </button>
          <span className="cap">{csv.note ?? 'Tous les départements du tableau ; séparateur point-virgule.'}</span>
        </p>
      )}
    </div>
  )
}

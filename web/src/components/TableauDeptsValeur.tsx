import { useMemo, type ReactNode } from 'react'
import TableauDeptsTri, { type Colonne } from './TableauDeptsTri'
import { fmt } from '../lib/data'
import type { LigneDept } from '../lib/tableauDepts'

interface LigneValeur extends LigneDept {
  v: number | null
  /** effectif sur lequel repose la valeur (piézomètres classés…) */
  n?: number
}

/**
 * Tableau des départements d'un indicateur de contexte (ressource, nappes, services d'eau ; revue du 2026-10-05) : ordre
 * alphabétique, tri au choix du visiteur et téléchargement CSV, comme les pages de sujets (TableauDeptsTri). Il remplace
 * les listes « les plus chers », « les plus élevés », « nappes les plus basses » : aucun palmarès de départements
 * (prudence de l'auteur, 2026-10-05).
 */
export default function TableauDeptsValeur({
  valeurs,
  noms,
  titre,
  format,
  quoi,
  lien,
  legende,
  effectif,
  csv,
  selection,
  onSurvol,
}: {
  /** valeur de chaque département, et l'effectif sur lequel elle repose */
  valeurs: ReadonlyMap<string, number | { v: number; n: number }>
  noms: ReadonlyMap<string, string>
  /** en-tête de la colonne de la valeur */
  titre: ReactNode
  format: (v: number) => string
  /** nom de la valeur dans la phrase d'état du tri */
  quoi: string
  lien?: (dd: string) => string
  legende: string
  /** nom de l'effectif dans le CSV, quand la valeur en a un (« Piézomètres classés ») */
  effectif?: string
  csv?: { sujet: string; annee: string | number; entete: string }
  selection?: string | null
  onSurvol?: (dd: string | null) => void
}) {
  const lignes = useMemo<LigneValeur[]>(
    () =>
      [...valeurs.entries()].map(([dd, x]) => ({
        dd,
        nom: noms.get(dd) ?? dd,
        v: typeof x === 'number' ? x : x.v,
        n: typeof x === 'number' ? undefined : x.n,
      })),
    [valeurs, noms],
  )
  // L'effectif s'écrit dans la cellule de la valeur (« 88 % sur 12 ») : une colonne de plus était coupée à côté de la
  // carte (nappes, 05/10) ; le CSV le garde dans sa propre colonne.
  const colonnes: Colonne<LigneValeur>[] = [
    {
      cle: 'v',
      titre,
      cellule: (l) =>
        l.v == null ? (
          '–'
        ) : (
          <>
            {format(l.v)}
            {l.n != null && <span className="muted"> sur {fmt.int(l.n)}</span>}
          </>
        ),
      valeur: (l) => l.v,
      num: true,
      quoi,
    },
  ]
  return (
    <TableauDeptsTri<LigneValeur>
      lignes={lignes}
      colonnes={colonnes}
      lien={lien}
      legende={legende}
      selection={selection}
      onSurvol={onSurvol}
      csv={
        csv && {
          sujet: csv.sujet,
          annee: csv.annee,
          entetes: ['Département', 'Code', csv.entete, ...(effectif ? [effectif] : [])],
          ligne: (l) => [l.nom, l.dd, l.v, ...(effectif ? [l.n ?? null] : [])],
        }
      }
    />
  )
}

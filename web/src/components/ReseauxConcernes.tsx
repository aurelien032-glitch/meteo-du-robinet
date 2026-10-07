import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIBELLES_ARS } from '../lib/bilan'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { reseauxClassesCD, reseauxFamilleAlpha, type Critere, type IndexReseaux } from '../lib/reseauxDept'
import { NBSP } from '../lib/instruments'
import { estPartiel, libellesCourts, toneSituation, type SituationsFile } from '../lib/situations'
import type { CommuneIndexEntry, DeptFile } from '../lib/types'
import Voyant from './Voyant'

/** Communes écrites dans une ligne ; les autres sont comptées. */
const COMMUNES_ECRITES = 2

/**
 * Réseaux classés C ou D d'un département (refonte, lot 3, tête de la fiche département et vue communale des classes de
 * /carte) : par ordre alphabétique de la première commune desservie, sans palmarès (lib/reseauxDept.ts,
 * reseauxClassesCD). Version textuelle de la carte communale des classes, dont chaque commune prend la lettre la plus
 * défavorable de ses réseaux.
 */
function ReseauxClasses({ dept, annee, situ }: { dept: string; annee: string | number; situ: SituationsFile | null | undefined }) {
  const indexReseaux = useJson<IndexReseaux>('recherche/reseaux.json').data
  const fichier = useJson<DeptFile>(`dept/${dept}.json`)
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const nomsCommunes = useMemo(() => (index ? new Map(index.map((e) => [e.c, e.n])) : undefined), [index])
  const [tout, setTout] = useState(false)
  useEffect(() => setTout(false), [dept, annee])
  const r = useMemo(
    () => (situ && (fichier.data || fichier.error) ? reseauxClassesCD(situ, indexReseaux, fichier.data, dept, annee, nomsCommunes) : null),
    [situ, indexReseaux, fichier.data, fichier.error, dept, annee, nomsCommunes],
  )
  if (!r) return <p className="muted">Chargement des réseaux…</p>
  const lignes = tout ? r.lignes : r.lignes.slice(0, 15)
  const partiel = estPartiel(annee)
  return (
    <>
      <h3>
        Réseaux notés C ou D {partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`}
        {r.lignes.length ? ` (${fmt.int(r.lignes.length)} sur ${fmt.nb(r.classes, 'réseau noté', 'réseaux notés')})` : ''}
      </h3>
      {r.lignes.length === 0 ? (
        <p className="muted">
          Aucun réseau du département n’est noté C ou D {partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`}
          {r.classes ? ` (${fmt.nb(r.classes, 'réseau noté', 'réseaux notés')})` : ''}.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data reseaux-concernes">
            <caption className="sr-only">Réseaux de distribution du département notés C ou D, par ordre alphabétique de la première commune desservie</caption>
            <thead>
              <tr>
                <th>Communes desservies</th>
                <th>Réseau</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.code}>
                  <td className="wrap">
                    {l.communes.length
                      ? `${l.communes.slice(0, COMMUNES_ECRITES).join(', ')}${l.communes.length > COMMUNES_ECRITES ? ` et ${fmt.nb(l.communes.length - COMMUNES_ECRITES, 'autre', 'autres')}` : ''}`
                      : '–'}
                  </td>
                  <td>
                    <Link to={`/reseau/${l.code}?annee=${annee}`}>{l.nom}</Link>
                  </td>
                  <td className="classe-cellule">
                    <span className={`tuile-ars petite tuile-${l.lettre}`} title={`${LIBELLES_ARS[l.lettre]}*`} aria-hidden="true">
                      {l.lettre}
                    </span>
                    <span className="sr-only">
                      Classe {l.lettre}, {LIBELLES_ARS[l.lettre]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.lignes.length > 15 && (
        <p className="muted">
          {tout ? fmt.nb(r.lignes.length, 'réseau') : `15 premiers sur ${fmt.int(r.lignes.length)}`}
          {' · '}
          <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
            {tout ? 'voir les 15 premiers' : 'voir tous les réseaux'}
          </button>
        </p>
      )}
      <p className="cap">
        C : {LIBELLES_ARS.C}* ; D : {LIBELLES_ARS.D}*. * Libellés de l’indicateur de l’ARS. Classes calculées par le site ; la synthèse de l’ARS fait foi.
      </p>
    </>
  )
}

/**
 * Réseaux concernés d'un département, à côté de sa carte des communes (fiche département, /carte) : des réseaux, pas des
 * communes (choix de l'auteur, 24/09, règle du projet). Chaque réseau vers sa fiche, avec les communes qu'il dessert et sa
 * situation, par ordre alphabétique de la première commune desservie (refonte, lot 4 : ni gravité ni taille) ; version
 * textuelle de la carte. Critère « classes » : les réseaux classés C ou D (ReseauxClasses).
 */
export default function ReseauxConcernes({
  dept,
  annee,
  situ,
  critere,
  libelle,
}: {
  dept: string
  annee: string | number
  situ: SituationsFile | null | undefined
  critere: Critere | 'classes'
  /** nom de l'indicateur, pour la phrase sans réseau (« Pesticides et métabolites », « PFAS ») */
  libelle: string
}) {
  if (critere === 'classes') return <ReseauxClasses dept={dept} annee={annee} situ={situ} />
  return <ReseauxFamille dept={dept} annee={annee} situ={situ} critere={critere} libelle={libelle} />
}

function ReseauxFamille({
  dept,
  annee,
  situ,
  critere,
  libelle,
}: {
  dept: string
  annee: string | number
  situ: SituationsFile | null | undefined
  critere: Critere
  libelle: string
}) {
  // Minuscule initiale au fil de la phrase, sauf pour un sigle (« PFAS », pas « pfas »).
  const nom = /^[A-Z]{2,}/.test(libelle) ? libelle : libelle.charAt(0).toLowerCase() + libelle.slice(1)
  const index = useJson<IndexReseaux>('recherche/reseaux.json').data
  const fichier = useJson<DeptFile>(`dept/${dept}.json`)
  const communes = useJson<CommuneIndexEntry[]>('communes.json').data
  const nomsCommunes = useMemo(() => (communes ? new Map(communes.map((e) => [e.c, e.n])) : undefined), [communes])
  const [tout, setTout] = useState(false)
  useEffect(() => setTout(false), [dept, critere, annee])
  // Ordre alphabétique de la première commune desservie (refonte, lot 4) : jamais un ordre de gravité ni de taille.
  const r = useMemo(
    () => (situ && (fichier.data || fichier.error) ? reseauxFamilleAlpha(situ, index, fichier.data, dept, annee, critere, nomsCommunes) : null),
    [situ, index, fichier.data, fichier.error, dept, annee, critere, nomsCommunes],
  )
  if (!r) return <p className="muted">Chargement des réseaux…</p>
  // Un réseau se juge par le voyant du sémaphore (forme et couleur de son état), comme dans ReseauxService et QuiDistribue.
  const ton = (classe: number) => (critere === 'restriction' ? 'bad' : toneSituation(critere, classe))
  const etat = (classe: number) => (critere === 'restriction' ? 'restriction ou consigne' : libellesCourts(critere)[classe])
  const lignes = tout ? r.lignes : r.lignes.slice(0, 15)
  const periode = estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`
  return (
    <>
      <h3>
        Réseaux concernés {periode}
        {r.lignes.length ? ` (${fmt.int(r.lignes.length)} sur ${fmt.nb(r.analyses, 'réseau analysé', 'réseaux analysés')})` : ''}
      </h3>
      {r.lignes.length === 0 ? (
        <p className="muted">
          Aucun réseau du département n’est concerné par «{NBSP}{nom}{NBSP}» {periode}
          {r.analyses ? ` (${fmt.nb(r.analyses, 'réseau analysé', 'réseaux analysés')})` : ''}.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data reseaux-concernes">
            <caption className="sr-only">Réseaux de distribution concernés du département, par ordre alphabétique de la première commune desservie</caption>
            <thead>
              <tr>
                <th>Communes desservies</th>
                <th>Réseau</th>
                <th>Situation</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.code}>
                  <td className="wrap">
                    {l.communes.length
                      ? `${l.communes.slice(0, COMMUNES_ECRITES).join(', ')}${l.communes.length > COMMUNES_ECRITES ? ` et ${fmt.nb(l.communes.length - COMMUNES_ECRITES, 'autre', 'autres')}` : ''}`
                      : '–'}
                  </td>
                  <td>
                    <Link to={`/reseau/${l.code}?annee=${annee}`}>{l.nom}</Link>
                  </td>
                  <td className="nowrap">
                    {/* Voyant posé comme un glyphe dans la ligne : le libellé s'enroule dessous dans une colonne étroite. */}
                    <span className="voyant-ligne">
                      <Voyant ton={ton(l.classe)} taille={16} />
                    </span>
                    {etat(l.classe)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.lignes.length > 15 && (
        <p className="muted">
          {tout ? fmt.nb(r.lignes.length, 'réseau') : `15 premiers sur ${fmt.int(r.lignes.length)}`}
          {' · '}
          <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
            {tout ? 'voir les 15 premiers' : 'voir tous les réseaux'}
          </button>
        </p>
      )}
    </>
  )
}

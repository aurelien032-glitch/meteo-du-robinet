import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Chargement from './Chargement'
import Search from './Search'
import Voyant from './Voyant'
import { dateAvis, phraseSansInformation, PRUDENCE_AVIS } from '../lib/accueil'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { reseauxFamilleAlpha, type IndexReseaux } from '../lib/reseauxDept'
import { estPartiel, libellesCourts, toneSituation, type FamilleSitu, type SituationsFile } from '../lib/situations'
import { MESURES, type Reference } from '../lib/sujets'
import { couleursEtats } from '../lib/theme'
import type { AvisNationalFile, CommuneIndexEntry, DeptFile } from '../lib/types'

/** Pictogramme d'information, neutre (aucun réseau en cause : ni jugement ni alerte). */
export function Info() {
  return (
    <svg className="cf-info" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.1" />
    </svg>
  )
}

function LienReference({ r }: { r: Reference }) {
  return r.url ? (
    <a href={r.url} rel="noopener" target="_blank">
      {r.titre}
      <span className="sr-only"> (nouvel onglet)</span>
      <span aria-hidden="true"> ↗</span>
    </a>
  ) : (
    <>{r.titre}</>
  )
}

/**
 * « Ce que mesure le contrôle sanitaire » (refonte, lot 4) : deux à quatre phrases tirées des textes officiels
 * (lib/sujets.ts, MESURES), la référence de chaque texte et le lien vers la règle de la Méthode. `apres` : un complément
 * calculé (limites des métaux et minéraux).
 */
export function MesureSujet({ sujet, apres }: { sujet: string; apres?: ReactNode }) {
  const m = MESURES[sujet]
  const id = useId()
  if (!m) return null
  return (
    <section className="carte-fiche sujet-mesure" aria-labelledby={`${id}-t`}>
      <h2 className="cf-grand-titre" id={`${id}-t`}>
        Ce que mesure le contrôle sanitaire
      </h2>
      <div className="sujet-phrases">
        {m.phrases.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {apres}
      </div>
      <div className="sujet-refs">
        <p className="cap">Textes de référence :</p>
        <ul className="cap">
          {m.references.map((r) => (
            <li key={r.titre}>
              <LienReference r={r} />
            </li>
          ))}
        </ul>
        <p className="cap">
          <Link to={m.methode}>Méthode du site</Link>. Le site ne formule aucune recommandation sanitaire ; pour toute consigne en vigueur dans une commune, la mairie et
          l’ARS font foi.
        </p>
      </div>
    </section>
  )
}

/** Recherche « Votre commune » : la recherche unique du site (codes postaux compris), qui ouvre la fiche de la commune. */
export function RechercheSujet({ texte }: { texte?: string }) {
  const id = useId()
  return (
    <section className="sujet-recherche" aria-labelledby={`${id}-t`}>
      <h2 className="cf-grand-titre" id={`${id}-t`}>
        Votre commune
      </h2>
      <p className="cap">{texte ?? 'La fiche de chaque commune donne la note de ses réseaux, les avis de l’ARS et le détail des analyses.'}</p>
      <div className="accueil-champ">
        <Search bouton="Voir mon eau" />
      </div>
    </section>
  )
}

/** Le chiffre d'une carte, précédé d'un voyant quand il compte un état (jamais devant un compte nul) ou du pictogramme neutre. */
export function ChiffreCarte({ n, ton, texte }: { n: number | null; ton?: 'good' | 'warn' | 'bad'; texte: ReactNode }) {
  return (
    <div className="cf-principal ac-principal">
      {ton ? <Voyant ton={ton} taille={30} /> : <Info />}
      <p>
        {n != null && <b className="ac-nombre">{fmt.int(n)}</b>} {texte}
      </p>
    </div>
  )
}

/**
 * Bloc des avis de l'ARS d'une carte « En ce moment » : la phrase des causes (lib/sujets.ts, phraseAvisCause), les
 * départements « sans information » (règle du 24/09) et la prudence ; la date d'arrêt est dans la tête de la carte.
 */
export function AvisDeLaCarte({ phrase, avis, annee }: { phrase: string | null; avis: AvisNationalFile | null; annee: string }) {
  if (!phrase) return null
  const muets = phraseSansInformation(avis?.sans_information?.[annee]?.length ?? 0, annee, estPartiel(annee))
  return (
    <>
      <p className="cf-texte">{phrase}</p>
      {muets && <p className="cap">{muets}</p>}
      <p className="cf-prudence">{PRUDENCE_AVIS}</p>
    </>
  )
}

/** Date de la tête d'une carte « En ce moment » : période et date d'arrêt des données de l'ARS. */
export const dateMoment = (annee: string, avis: AvisNationalFile | null) => dateAvis(annee, estPartiel(annee), avis?.arret?.[annee])

/** Barre empilée d'une répartition, aux couleurs des classes de la famille ; texte équivalent en `aria-label`. */
export function BarreClasses({ valeurs, tons, texte }: { valeurs: readonly number[]; tons: readonly ('good' | 'warn' | 'bad')[]; texte: string }) {
  const couleurs = couleursEtats(tons)
  return (
    <div className="repartition-ars" role="img" aria-label={texte}>
      {valeurs.map((v, i) => (v ? <span key={i} style={{ flexGrow: v, background: couleurs[i] }} /> : null))}
    </div>
  )
}

/** Communes écrites dans une ligne ; les autres sont comptées. */
const COMMUNES_ECRITES = 2

/**
 * Réseaux concernés d'une famille, département par département (refonte, lot 4) : le visiteur choisit un département ;
 * ses réseaux non conformes (nitrates dès 40 mg/L, comme la carte) s'affichent par ordre alphabétique de la première
 * commune desservie, comme sur la fiche département. Une liste, pas un palmarès.
 */
export function ReseauxParDepartement({
  fam,
  situ,
  annee,
  departements,
  nomFamille,
  note,
}: {
  fam: Exclude<FamilleSitu, 'toutes'>
  situ: SituationsFile | null
  annee: number
  /** départements proposés, dans l'ordre alphabétique : [code, nom] */
  departements: readonly [string, string][]
  /** « les PFAS », « les pesticides » */
  nomFamille: string
  /** ce que comprend la liste, quand elle va au-delà des non conformes (nitrates de 40 à 50 mg/L) */
  note?: string
}) {
  const id = useId()
  const [dd, setDd] = useState('')
  const index = useJson<IndexReseaux>(dd ? 'recherche/reseaux.json' : null).data
  const fichier = useJson<DeptFile>(dd ? `dept/${dd}.json` : null)
  const communes = useJson<CommuneIndexEntry[]>(dd ? 'communes.json' : null).data
  const noms = useMemo(() => (communes ? new Map(communes.map((e) => [e.c, e.n])) : undefined), [communes])
  const [tout, setTout] = useState(false)
  useEffect(() => setTout(false), [dd, annee])
  const r = useMemo(
    () => (dd && situ && (fichier.data || fichier.error) ? reseauxFamilleAlpha(situ, index, fichier.data, dd, annee, fam, noms) : null),
    [dd, situ, index, fichier.data, fichier.error, annee, fam, noms],
  )
  const partiel = estPartiel(annee)
  const periode = partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`
  const lignes = r ? (tout ? r.lignes : r.lignes.slice(0, 20)) : []
  const nomDept = departements.find(([c]) => c === dd)?.[1]
  return (
    <section className="carte-fiche" aria-labelledby={`${id}-t`}>
      <h2 className="cf-grand-titre" id={`${id}-t`}>
        Réseaux concernés par département {periode}
      </h2>
      <p className="cf-texte">
        Les réseaux concernés {periode} pour {nomFamille} s’affichent par ordre alphabétique de la première commune desservie, avec un lien vers la fiche de chaque
        réseau.{note ? ` ${note}` : ''}
      </p>
      <label className="sujet-choix">
        Département{' '}
        <select value={dd} onChange={(e) => setDd(e.target.value)}>
          <option value="">Choisir un département</option>
          {departements.map(([c, n]) => (
            <option key={c} value={c}>
              {n} ({c})
            </option>
          ))}
        </select>
      </label>
      {dd && !r && <Chargement texte="Chargement des réseaux…" />}
      {r && r.lignes.length === 0 && (
        <p className="muted">
          Aucun réseau de {nomDept ?? dd} n’est concerné {periode}
          {r.analyses ? ` (${fmt.nb(r.analyses, 'réseau analysé', 'réseaux analysés')})` : ' ; aucun réseau n’y a été analysé pour cette famille'}.
        </p>
      )}
      {r && r.lignes.length > 0 && (
        <>
          <p className="cap">
            {fmt.nb(r.lignes.length, 'réseau concerné', 'réseaux concernés')} sur {fmt.nb(r.analyses, 'réseau analysé', 'réseaux analysés')}.
          </p>
          <div className="table-scroll">
            <table className="data reseaux-concernes">
              <caption className="sr-only">
                Réseaux concernés de {nomDept ?? dd} {periode}, par ordre alphabétique de la première commune desservie
              </caption>
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
                      <span className="voyant-ligne">
                        <Voyant ton={toneSituation(fam, l.classe)} taille={16} />
                      </span>
                      {libellesCourts(fam)[l.classe]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.lignes.length > 20 && (
            <p className="muted">
              {tout ? fmt.nb(r.lignes.length, 'réseau') : `20 premiers sur ${fmt.int(r.lignes.length)}`}
              {' · '}
              <button className="btn-link" type="button" onClick={() => setTout((v) => !v)}>
                {tout ? 'voir les 20 premiers' : 'voir tous les réseaux'}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}

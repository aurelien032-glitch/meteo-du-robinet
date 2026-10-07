import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Chargement from './Chargement'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { part100 } from '../lib/horsGrille'
import { anneesTfa, CODE_TFA, deptsTfa, phraseRechercheTfa } from '../lib/sujets'
import { defaultYear, yearLabel, type HorsGrilleFile, type MetaFile } from '../lib/types'

/** Valeur mesurée avec une précision adaptée à son ordre de grandeur. */
const val = (v: number | null) => (v == null ? '–' : fmt.dec(v, v < 1 ? 3 : v < 10 ? 2 : 1))

/**
 * Section « TFA » de la page « PFAS et TFA » (refonte, lot 4, règle de l'auteur du 2026-10-05) : l'acide
 * trifluoroacétique n'est pas l'un des 20 PFAS de la somme soumise à une limite de qualité et n'a pas de limite propre ;
 * ses analyses (horsgrille.json, groupe « tfa ») sont présentées sans jugement : recherche, quantification, maximum. Des
 * repères ne s'affichent que s'ils figurent dans les données (valeurs citées par l'ARS) ; aucun n'y figure à ce jour.
 */
export default function SectionTfa({ meta, annee }: { meta: MetaFile; annee?: string }) {
  const hg = useJson<HorsGrilleFile>('horsgrille.json').data
  const { names } = useDepartements()
  const annees = useMemo(() => anneesTfa(hg), [hg])
  // Année de référence : celle de la barre d'année de la page, une seule année par page (parcours, 2026-10-06).
  const anneeRef = annee ?? String(defaultYear(meta) ?? '')
  const ref = annees.find((a) => a.annee === anneeRef) ?? annees[annees.length - 1]
  const depts = useMemo(() => (ref ? deptsTfa(hg, ref.annee, (dd) => names.get(dd) ?? dd) : []), [hg, ref, names])
  const reperes = hg?.substances[CODE_TFA]?.reperes ?? []
  const unite = hg?.substances[CODE_TFA]?.u ?? 'µg/L'
  return (
    <section id="tfa" className="carte-fiche sujet-tfa" aria-labelledby="t-tfa">
      <h2 className="cf-grand-titre" id="t-tfa">
        Le TFA (acide trifluoroacétique)
      </h2>
      <p className="cf-texte">
        Le TFA ne figure pas parmi les 20 PFAS dont la somme est soumise à la limite de qualité de 0,1 µg/L, et l’arrêté du 11 janvier 2007 modifié ne lui fixe pas de
        limite de qualité propre. Ses résultats ne peuvent donc pas être comparés à une limite : le site les présente sans jugement, comme les autres substances sans
        limite de qualité.
      </p>
      {!hg ? (
        <Chargement texte="Chargement des analyses du TFA…" />
      ) : (
        <>
          {ref && <p className="cf-texte">{phraseRechercheTfa(ref)}</p>}
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Analyses du TFA publiées dans le contrôle sanitaire, par année</caption>
              <thead>
                <tr>
                  <th>Année</th>
                  <th className="num">Analyses</th>
                  <th className="num">Analyses quantifiées</th>
                  <th className="num">Réseaux où recherché</th>
                  <th className="num">Communes où recherché</th>
                  <th className="num">Maximum</th>
                </tr>
              </thead>
              <tbody>
                {annees.map((a) => (
                  <tr key={a.annee}>
                    <td>{yearLabel(meta, a.annee)}</td>
                    <td className="num">{fmt.int(a.analyses)}</td>
                    <td className="num">{fmt.int(a.quantifiees)}</td>
                    <td className="num">{fmt.int(a.reseaux)}</td>
                    <td className="num">
                      {fmt.int(a.communes)}
                      {a.communesTotal ? <span className="muted"> ({part100(a.communes, a.communesTotal, true)})</span> : null}
                    </td>
                    <td className="num">{a.analyses ? `${val(a.max)} ${unite}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ref && depts.length > 0 && (
            <p className="cap">
              Départements où le TFA a été recherché en {ref.annee} : {depts.map((d) => `${d.nom} (${fmt.nb(d.cherche, 'commune')}, quantifié dans ${fmt.int(d.quantifie)})`).join(' ; ')}.
            </p>
          )}
          {reperes.length > 0 && (
            <p className="cap">
              Repères cités par l’ARS dans ses conclusions, qui ne sont pas des limites de qualité : {reperes.map((r) => `${fmt.dec(r.v, r.v < 1 ? 1 : 0)} ${unite}, ${r.lib} (${r.src})`).join(' ; ')}.
            </p>
          )}
          <p className="cap">
            Une analyse est quantifiée lorsque son résultat dépasse le seuil de quantification du laboratoire. L’absence de résultat dans un lieu peut signifier que la
            substance n’y a pas été recherchée.
          </p>
        </>
      )}
      <p className="cf-liens">
        <Link to="/hors-grille?groupe=tfa">Voir le TFA parmi les substances sans limite de qualité, par département</Link>
        <Link to="/methode#hors-grille">Méthode</Link>
      </p>
    </section>
  )
}

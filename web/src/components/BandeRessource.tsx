import { useId } from 'react'
import { Link } from 'react-router-dom'
import Paliers from './Paliers'
import { useJson } from '../lib/hooks'
import { DISTANCE_MAX_KM, nappeCommune, origineCommune, phraseNappe, phraseOrigine } from '../lib/ressourceCommune'
import type { AmontDeptFile, NappesDept, NappesNational } from '../lib/types'
import { NIVEAUX_SECHERESSE, secheresseCommune, TONS_SECHERESSE, TYPES_ZONE, useVigiEau } from '../lib/vigieau'

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR')

/**
 * « La ressource, aujourd'hui » (maquette du 23/09) : bande à part en bas de la fiche commune, hors de la portée de
 * la barre d'année — chaque information porte sa date. D'où vient l'eau, restrictions sécheresse du jour (VigiEau),
 * nappe suivie la plus proche : du contexte, sur des paliers gris, sans jugement de conformité. Le détail (ouvrages,
 * zones, courbe du piézomètre) reste dans les sections repliées au-dessus.
 */
export default function BandeRessource({ insee, dept }: { insee: string; dept: string }) {
  const id = useId()
  const amont = useJson<AmontDeptFile>(`amont/dept/${dept}.json`)
  const nat = useJson<NappesNational>('nappes/national.json').data
  const nd = useJson<NappesDept>(`nappes/${dept}.json`).data
  const vigi = useVigiEau(insee)
  const aujourdhui = new Date().toLocaleDateString('fr-FR')
  const sech = vigi.zones ? secheresseCommune(vigi.zones) : null
  const nappe = nat && nd ? nappeCommune(nat, nd, insee) : null

  return (
    // `bande` : pleine largeur, hors de la gouttière des enfants de `.page` (styles.css).
    <section className="bande bande-ressource" aria-labelledby={`${id}-t`}>
      <div className="bande-interieur">
        <div className="bloc-tete">
          <h2 id={`${id}-t`}>La ressource, aujourd’hui</h2>
          <p className="cap">Ne suit pas l’année choisie plus haut : chaque information porte sa date. Du contexte, sans jugement de conformité.</p>
        </div>
        <div className="ressource-cases">
          <section aria-labelledby={`${id}-o`}>
            <h3 id={`${id}-o`}>D’où vient l’eau</h3>
            {amont.data ? (
              <p>{phraseOrigine(origineCommune(amont.data, insee))}</p>
            ) : amont.error ? (
              <p className="muted">Ouvrages de prélèvement indisponibles.</p>
            ) : (
              <p className="muted">Chargement…</p>
            )}
            <p className="cap">Ouvrages recensés par la BNPE : un ouvrage de la commune peut en alimenter d’autres, et inversement.</p>
          </section>

          <section aria-labelledby={`${id}-s`}>
            <h3 id={`${id}-s`}>Restrictions sécheresse</h3>
            {sech ? (
              <>
                <Paliers classes={NIVEAUX_SECHERESSE.map((t, i) => ({ t, ton: TONS_SECHERESSE[i] }))} actif={sech.niveau} nom="Restrictions sécheresse" />
                <p className="cap">
                  {sech.pire
                    ? `Niveau le plus élevé sur la commune au ${aujourdhui} : ${NIVEAUX_SECHERESSE[sech.niveau].toLowerCase()}${
                        TYPES_ZONE[sech.pire.type] ? `, ${TYPES_ZONE[sech.pire.type]}` : ''
                      }${sech.pire.arrete?.dateDebutValidite ? `, arrêté du ${dateFr(sech.pire.arrete.dateDebutValidite)}` : ''}.`
                    : `Aucune restriction en vigueur sur la commune au ${aujourdhui}.`}{' '}
                  Source : VigiEau, interrogé en direct.
                </p>
              </>
            ) : vigi.erreur ? (
              <p className="cap">
                {vigi.erreur.includes('plusieurs zones')
                  ? 'VigiEau ne rattache pas cette commune à une zone unique : les restrictions se lisent sur la carte nationale.'
                  : 'VigiEau injoignable pour le moment.'}{' '}
                <Link to="/secheresse">Carte des restrictions</Link>
              </p>
            ) : (
              <p className="muted">Interrogation de VigiEau…</p>
            )}
          </section>

          <section aria-labelledby={`${id}-n`}>
            <h3 id={`${id}-n`}>La nappe la plus proche</h3>
            {!nat || !nd ? (
              <p className="muted">Chargement…</p>
            ) : nappe ? (
              <>
                <Paliers classes={nat.classes.map((t) => ({ t: majuscule(t) }))} actif={nappe.classe} nom="Niveau de la nappe la plus proche" />
                <p className="cap">{phraseNappe(nappe, nat.classes)}</p>
              </>
            ) : (
              <p className="cap">Aucun piézomètre suivi depuis au moins 15 ans à moins de {DISTANCE_MAX_KM} km.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}

import { useId } from 'react'
import { Link } from 'react-router-dom'
import Paliers from './Paliers'
import { majuscule } from '../lib/data'
import { useJson } from '../lib/hooks'
import { DISTANCE_MAX_KM, nappeCommune, origineCommune, phraseNappe, phraseOrigine } from '../lib/ressourceCommune'
import type { AmontDeptFile, NappesDept, NappesNational } from '../lib/types'
import { NIVEAUX_SECHERESSE, secheresseCommune, TONS_SECHERESSE, TYPES_ZONE, useVigiEau } from '../lib/vigieau'

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
          <h2 id={`${id}-t`}>La ressource en eau, dernières données</h2>
          <p className="cap">
            Ces informations ne dépendent pas de l’année choisie plus haut et chacune porte sa propre date. Elles décrivent le contexte de la
            ressource et ne constituent pas un jugement de conformité.
          </p>
        </div>
        <div className="ressource-cases">
          <section aria-labelledby={`${id}-o`}>
            {/* Les ouvrages situés sur la commune, pas l'origine de son eau ; et « D'où vient l'eau » titrait déjà une
                section du détail (vérification du 24/09). */}
            <h3 id={`${id}-o`}>Prélèvements sur la commune</h3>
            {amont.data ? (
              <p>{phraseOrigine(origineCommune(amont.data, insee))}</p>
            ) : amont.error ? (
              <p className="muted">Les données sur les ouvrages de prélèvement ne sont pas disponibles.</p>
            ) : (
              <p className="muted">Chargement…</p>
            )}
            <p className="cap">
              Ouvrages recensés par la BNPE. Un ouvrage situé sur la commune peut alimenter d’autres communes, et la commune peut être alimentée
              par des ouvrages situés ailleurs.
            </p>
          </section>

          <section aria-labelledby={`${id}-s`}>
            {/* Sous l'ancien titre « Puis-je boire l'eau ? », un « crise » rouge se lisait comme un interdit de boire (vérification du
                24/09) : le titre et la phrase disent qu'il s'agit des usages. */}
            <h3 id={`${id}-s`}>Restrictions d’usage (sécheresse)</h3>
            {sech ? (
              <>
                <Paliers classes={NIVEAUX_SECHERESSE.map((t, i) => ({ t, ton: TONS_SECHERESSE[i] }))} actif={sech.niveau} nom="Restrictions d’usage (sécheresse)" />
                <p className="cap">
                  Ces restrictions encadrent certains usages de l’eau (arrosage, lavage, remplissage…) et ne concernent pas l’eau destinée à la
                  consommation.{' '}
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
                  ? 'VigiEau ne rattache pas cette commune à une zone unique. Les restrictions applicables figurent sur la carte nationale.'
                  : 'Le service VigiEau ne répond pas pour le moment.'}{' '}
                <Link to="/secheresse">Carte des restrictions</Link>
              </p>
            ) : (
              <p className="muted">Interrogation de VigiEau…</p>
            )}
          </section>

          <section aria-labelledby={`${id}-n`}>
            {/* Le piézomètre le plus proche ne mesure pas forcément la nappe qui alimente le robinet. */}
            <h3 id={`${id}-n`}>La nappe mesurée la plus proche</h3>
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

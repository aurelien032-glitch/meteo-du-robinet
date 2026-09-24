import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import Chargement from './Chargement'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { moisFr } from '../lib/nappes'
import { deLieu } from '../lib/ressourceCommune'
import type { NappesDept, NappesNational, SecheresseHist } from '../lib/types'

// La courbe du piézomètre est la seule chose de la fiche commune qui demande ECharts : chargée à l'ouverture
// de sa section, elle ne pèse plus sur la fiche (étape 12 du plan).
const PiezoChart = lazy(() => import('./PiezoChart'))

/** Au-delà, le piézomètre le plus proche ne dit plus grand-chose de la nappe sous la commune. */
const DISTANCE_MAX_KM = 40

/**
 * Ressource autour de la commune : la nappe suivie la plus proche (niveau du dernier mois complet comparé aux
 * mêmes mois passés) et l'historique des restrictions sécheresse du département.
 */
export default function NappeCard({ insee, dept }: { insee: string; dept: string }) {
  const nat = useJson<NappesNational>('nappes/national.json').data
  const nd = useJson<NappesDept>(`nappes/${dept}.json`).data
  const hist = useJson<SecheresseHist>('secheresse/historique.json').data
  if (!nat || !nd || !hist) return null
  const proche = nd.communes[insee]
  const p = proche && proche[1] <= DISTANCE_MAX_KM ? nd.piezometres[proche[0]] : undefined
  const k = p?.classes[nat.mois_ref]
  const h = hist.depts[dept] ?? {}
  const annees = hist.annees.filter((a) => h[a])
  const derniere = hist.annees[hist.annees.length - 1]
  const crise = (a: string) => h[a]?.[3] ?? 0
  const pire = annees.length ? annees.reduce((a, b) => (crise(b) > crise(a) ? b : a)) : undefined

  return (
    <div className="card" id="nappe">
      <h2>La ressource autour de la commune</h2>
      {!p ? (
        <p className="muted">Aucun piézomètre suivi depuis au moins 15 ans à moins de {DISTANCE_MAX_KM} km.</p>
      ) : (
        <>
          <p>
            Nappe suivie la plus proche : piézomètre {deLieu(p.commune ?? proche![0])[0]}
            <b>{deLieu(p.commune ?? proche![0])[1]}</b> ({fmt.dec(proche![1], 0)} km){p.nappe ? `, ${p.nappe}` : ''}.{' '}
            {k != null ? (
              <>
                En {moisFr(nat.mois_ref)}, son niveau était <b>{nat.classes[k]}</b>{' '}
                par rapport aux mêmes mois depuis {p.debut?.slice(0, 4)}.
              </>
            ) : (
              <span className="muted">Pas de mesure exploitable en {moisFr(nat.mois_ref)}.</span>
            )}
          </p>
          <Suspense fallback={<Chargement carte texte="Chargement de la courbe…" />}>
            <PiezoChart p={p} code={proche![0]} height={240} />
          </Suspense>
        </>
      )}
      <p>
        Restrictions sécheresse dans le département :{' '}
        {annees.length === 0 ? (
          <span className="muted">aucun arrêté avec niveau depuis 2012.</span>
        ) : !pire || crise(pire) === 0 ? (
          <>
            aucun jour en crise depuis 2012 ; en {derniere}, {fmt.int(h[derniere]?.[2] ?? 0)} jours en alerte renforcée et {fmt.int(h[derniere]?.[1] ?? 0)} en alerte.
          </>
        ) : (
          <>
            <b>{fmt.int(crise(derniere))}</b> jour{crise(derniere) > 1 ? 's' : ''} en crise en {derniere} (sur au moins une zone)
            {pire && pire !== derniere ? `, ${fmt.int(crise(pire))} en ${pire}, l'année la plus longue depuis 2012` : ''}.
          </>
        )}
      </p>
      <div className="source">
        Piézométrie Hub'Eau (BRGM), classes calculées par le site à la manière de l'indicateur du BRGM ; arrêtés sécheresse (VigiEau).{' '}
        <Link to="/nappes">Les nappes en France</Link> · <Link to="/secheresse">Sécheresse</Link>.
      </div>
    </div>
  )
}

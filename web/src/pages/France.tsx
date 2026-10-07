import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CarteNotesAgregat, CartePrixAgregat, CarteSecheresseFrance, EvolutionNotes, SavoirPlus, type LigneSavoir } from '../components/Cartes'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import TableauDepartements from '../components/TableauDepartements'
import { comptesClasses, phraseSansInformation } from '../lib/accueil'
import { fmt } from '../lib/data'
import { comptesParDepartement, DESC_CARTE_DEPTS, infoBulleDept, lignesFrance, partCD, PHRASE_CLASSE_C, PHRASE_PART, PIED_FRANCE } from '../lib/france'
import { useDepartements } from '../lib/geo'
import { useJson, usePremierRendu } from '../lib/hooks'
import { lienCommunesCarte, lienDepartement } from '../lib/parcours'
import { qualiteScale } from '../lib/scale'
import { estPartiel, type SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import type { AvisNationalFile, MetaFile, SispeaNationalFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

/**
 * « La France », dans l'ordre de l'habitant (maquette « Vision d'ensemble » validée le 2026-10-06 ; lot 3, 07/10) : la
 * qualité de l'eau de l'année choisie (notes A–D de chaque réseau, calculées par le site selon la méthode de l'ARS, et
 * la carte des départements en part de réseaux notés C ou D), la sécheresse du jour, le prix et la gestion ; puis
 * « Pour en savoir plus » : le tableau alphabétique des départements (version textuelle de la carte, tri au choix du
 * visiteur, sans palmarès), l'évolution depuis 2023, les sujets et la carte détaillée.
 */
export default function France() {
  const meta = useJson<MetaFile>('meta.json').data
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06) ; les années complètes restent dans les onglets.
  const [y, setYear] = useYear(meta)
  const situQ = useJson<SituationsFile>(y ? `situations/${y}.json` : null)
  const situ = situQ.data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  const sispea = useJson<SispeaNationalFile>('sispea/national.json')
  const { deps, names } = useDepartements()
  const [survol, setSurvol] = useState<string | null>(null)
  usePageTitle('L’eau du robinet en France', 'Note A, B, C ou D de chaque réseau d’eau potable, calculée par le site selon la méthode de l’indicateur de l’ARS, pour la France et par département.')

  const national = useMemo(() => (situ ? comptesClasses(situ) : null), [situ])
  const parDept = useMemo(() => comptesParDepartement(situ), [situ])
  const lignesDepts = useMemo(() => lignesFrance(parDept, (dd) => names.get(dd) ?? dd), [parDept, names])
  const scale = useMemo(() => qualiteScale(), [])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(partCD(parDept.get(String(p.code)))), [scale, parDept])
  const labelOf = useCallback((p: Record<string, unknown>) => infoBulleDept(String(p.nom), String(p.code), parDept.get(String(p.code)), y ?? ''), [parDept, y])
  const fiche = useCallback((dd: string) => `${lienDepartement(dd, { indic: 'classes' })}&annee=${y}`, [y])
  // Les cartes se dessinent ensemble (usePremierRendu) : chacune, en arrivant, repoussait la suite de la page.
  const pret = usePremierRendu(!!meta && !situQ.loading && names.size > 0 && !!avis && !sispea.loading)

  const a = y != null ? String(y) : ''
  const periode = estPartiel(a) ? `depuis le 1er janvier ${a}` : `en ${a}`
  const lignes: LigneSavoir[] = [
    {
      id: 'departements',
      titre: 'Les départements, en tableau',
      aussi: ['depts', 'tableau'],
      contenu: (
        <>
          <p className="carte2-ligne">{PHRASE_PART}</p>
          {lignesDepts.length ? (
            <TableauDepartements lignes={lignesDepts} annee={a} lien={fiche} selection={survol} onSurvol={setSurvol} />
          ) : (
            <Chargement texte="Chargement des départements…" />
          )}
          <p className="carte2-note">{PHRASE_CLASSE_C}</p>
        </>
      ),
    },
    { id: 'evolution', titre: `L’évolution depuis ${anneesFiche(meta)[0]?.annee ?? ''}`.trim(), contenu: meta ? <EvolutionNotes meta={meta} /> : null },
    { id: 'sujets', titre: 'Pesticides, nitrates, PFAS, bactéries', vers: '/themes' },
    { id: 'carte', titre: 'La carte détaillée', vers: `/carte?indic=classes&annee=${a}` },
    { id: 'methode', titre: 'Comment la note est calculée', vers: '/methode#classe-ars' },
  ]

  return (
    <div className="page fiche2 france2">
      <Crumbs items={[{ label: 'La France' }]} />
      <h1>L’eau du robinet en France</h1>

      {!pret || !national ? (
        <Chargement reserve />
      ) : (
        <div className="cartes-fiche">
          <CarteNotesAgregat
            annee={a}
            c={national}
            legende="comptes"
            onglets={{ annees: anneesFiche(meta), onAnnee: setYear }}
            avis={{ restriction: avis?.annees[a]?.interdiction?.reseaux ?? 0, ebullition: avis?.annees[a]?.ebullition?.reseaux ?? 0, arret: avis?.arret?.[a], lien: `/avis?annee=${a}` }}
            muets={phraseSansInformation(avis?.sans_information?.[a]?.length ?? 0, a, estPartiel(a))}
            carte={
              <div className="carte2-carte">
                <FranceMap
                  data={situ ? deps : null}
                  colorOf={colorOf}
                  labelOf={labelOf}
                  encart={(dd) => ({ fiche: fiche(dd), communes: lienCommunesCarte(dd, 'classes', { annee: a }) })}
                  onHover={(p) => setSurvol(p ? String(p.code) : null)}
                  selected={survol}
                  height="min(520px, 110vw)"
                  ariaLabel={`Carte des départements : ${DESC_CARTE_DEPTS}, ${periode}. Le tableau « Les départements » en donne une version textuelle.`}
                />
                <MapLegend desc={DESC_CARTE_DEPTS} scale={scale} format={fmt.pctBorne} noDataLabel="aucun réseau noté" />
                <p className="carte2-note">Un clic sur un département ouvre sa fiche, avec la carte de ses communes.</p>
              </div>
            }
          />
          <CarteSecheresseFrance />
          <CartePrixAgregat nat={sispea.data} />
          <SavoirPlus lignes={lignes} />
        </div>
      )}

      <div className="source">
        {PIED_FRANCE} <Link to="/methode#classe-ars">Méthode</Link>. Sources : contrôle sanitaire de l’eau potable (SISE-Eaux, ministère chargé de la
        Santé), calcul du site ; services d’eau, observatoire SISPEA (OFB) ; restrictions sécheresse (VigiEau). Contours : Etalab / IGN Admin Express.
      </div>
    </div>
  )
}

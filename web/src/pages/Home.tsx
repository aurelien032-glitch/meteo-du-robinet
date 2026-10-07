import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CarteNotesAgregat, CartePrixAgregat, CarteSecheresseFrance, SavoirPlus, type LigneSavoir } from '../components/Cartes'
import Chargement from '../components/Chargement'
import Search from '../components/Search'
import { comptesClasses, phraseSansInformation, PRUDENCE_AVIS } from '../lib/accueil'
import { useJson, usePremierRendu } from '../lib/hooks'
import { declarerPartiels, estPartiel, type SituationsFile } from '../lib/situations'
import { defaultYear, type AvisNationalFile, type MetaFile, type SispeaNationalFile } from '../lib/types'

const LIGNES: LigneSavoir[] = [
  { id: 'france', titre: 'La France, département par département', vers: '/france' },
  { id: 'sujets', titre: 'Pesticides, nitrates, PFAS, bactéries', vers: '/themes' },
  { id: 'ressource', titre: 'La ressource en eau', vers: '/ressource-en-eau' },
  { id: 'methode', titre: 'Comment la note est calculée', vers: '/methode#classe-ars' },
]

/**
 * Accueil, dans l'ordre de l'habitant (maquette « Vision d'ensemble » validée le 2026-10-06 ; lot 2, 07/10) : la recherche
 * d'abord ; puis l'eau en France en cartes délimitées, les mêmes que sur « La France » (components/Cartes.tsx) — la
 * qualité de l'eau de l'année en cours, la sécheresse du jour, le prix et la gestion — et « Pour en savoir plus » (La
 * France, les sujets, la ressource, la méthode). Aucun palmarès ni mode d'emploi.
 */
export default function Home() {
  const meta = useJson<MetaFile>('meta.json').data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  const nat = useJson<SispeaNationalFile>('sispea/national.json')
  // Bilan de l'année en cours, comme toutes les pages (auteur, 2026-10-06). Sans barre d'année, l'accueil déclare lui-même
  // les millésimes partiels (« Notes provisoires… depuis le 1er janvier 2026 »).
  if (meta) declarerPartiels(meta.partiel ?? [])
  const annee = defaultYear(meta)
  const situ = useJson<SituationsFile>(annee ? `situations/${annee}.json` : null).data
  const c = useMemo(() => (situ ? comptesClasses(situ) : null), [situ])
  // Les cartes arrivent ensemble (usePremierRendu) : chacune, en arrivant, repoussait la suite de la page.
  const pret = usePremierRendu(!!meta && !!avis && !nat.loading && (!annee || !!situ))
  const a = annee ? String(annee) : null

  return (
    <div className="page fiche2 accueil2">
      <section className="accueil2-tete" aria-labelledby="accueil-titre">
        <h1 id="accueil-titre">Quelle eau coule à votre robinet ?</h1>
        <div className="accueil-champ">
          <Search bouton="Voir mon eau" placeholder="Par exemple : Saint-Quentin, 02100" />
        </div>
      </section>

      <p className="accueil2-sur">L’eau en France</p>
      {pret && a && c ? (
        <div className="cartes-fiche">
          <CarteNotesAgregat
            annee={a}
            c={c}
            avis={{ restriction: avis?.annees[a]?.interdiction?.reseaux ?? 0, ebullition: avis?.annees[a]?.ebullition?.reseaux ?? 0, arret: avis?.arret?.[a], lien: `/avis?annee=${a}` }}
            muets={phraseSansInformation(avis?.sans_information?.[a]?.length ?? 0, a, estPartiel(a))}
          />
          <CarteSecheresseFrance />
          <CartePrixAgregat nat={nat.data} />
          <SavoirPlus lignes={LIGNES} />
        </div>
      ) : (
        <Chargement reserve />
      )}

      <div className="source">
        Sources : contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, via data.gouv.fr) ; services d’eau, observatoire SISPEA (OFB) ;
        restrictions sécheresse (VigiEau). {PRUDENCE_AVIS} Le site n’est pas une publication officielle.{' '}
        <Link to="/methode#lexique">Les mots du site</Link> · <Link to="/mentions-legales">Mentions légales</Link>
      </div>
    </div>
  )
}

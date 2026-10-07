import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { TITRES_NOTE } from '../lib/monEau'
import { lignesReseauxService, type ReseauDuService } from '../lib/service'
import type { SituationsFile } from '../lib/situations'
import { Goutte } from './MonEau'

/** Nom de réseau coupable après « / » et « _ » (« CEBR_VILLEJEAN/ROPHEMEL/… »), jamais au milieu d'un mot. */
function NomCoupable({ nom }: { nom: string }) {
  // Découpage avec groupe capturant plutôt qu'un lookbehind, que Safari ne lit qu'à partir de la 16.4.
  return (
    <>
      {nom.split(/([/_])/).map((morceau, i) => (
        <Fragment key={i}>
          {morceau}
          {(morceau === '/' || morceau === '_') && <wbr />}
        </Fragment>
      ))}
    </>
  )
}

/**
 * Les réseaux qui desservent les communes d'un service, chacun avec sa situation de l'année (proposition
 * du 23/09, sur le modèle de la maquette « Vigilance + instruments ») : la page ne montrait qu'un agrégat
 * « X / N réseaux non conformes ». Chaque réseau porte le voyant du sémaphore des bilans officiels (toneSituation) ;
 * l'agrégat, au-dessus, celui du réseau le plus défavorable (PhraseAgregat, tonAgregat). Une ligne par réseau, voyant en
 * tête (maquette du 23/09, « Ses réseaux en {année} ») : le statut est écrit, le voyant n'en est que la forme.
 */
export default function ReseauxService({
  reseaux,
  situ,
  annee,
  noms,
}: {
  reseaux: readonly ReseauDuService[]
  situ: SituationsFile
  annee: string
  /** code INSEE → nom officiel, pour le nom lisible complet des réseaux */
  noms?: ReadonlyMap<string, string>
}) {
  if (!reseaux.length) return <p className="muted">Aucun réseau n’est rattaché aux communes du service en {annee}.</p>
  // Du plus défavorable au plus favorable, les réseaux sans analyse en dernier (même ordre que la fiche pré-générée).
  const lignes = lignesReseauxService(reseaux, situ, annee, noms)
  // Le distributeur principal est dit une fois, pas sur chaque ligne (même idée que la fiche commune pour les
  // six réseaux de Bordeaux) ; seules les exceptions sont écrites sur leur ligne (Grand Reims : 22 réseaux de
  // la communauté urbaine, un de Veolia).
  const parDist = new Map<string, number>()
  for (const l of lignes) if (l.dist) parDist.set(l.dist, (parDist.get(l.dist) ?? 0) + 1)
  const [principal, nPrincipal] = [...parDist].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const distPrincipal = principal && (nPrincipal >= 2 || lignes.length === 1) ? principal : null
  const exceptions = lignes.some((l) => l.dist && l.dist !== distPrincipal)
  return (
    <div>
      {distPrincipal && (
        <p className="cap reseaux-dist">
          Distributeur (contrôle sanitaire) : {distPrincipal}
          {exceptions ? ', sauf mention contraire' : ''}. <Link to="/methode#exploitant">Rôles du service, de l’exploitant et du distributeur</Link>.
        </p>
      )}
      <ul className="reseaux-lignes" aria-label={`Réseaux qui desservent les communes du service en ${annee}, de la note la plus défavorable à la plus favorable`}>
        {lignes.map(({ r, nom, dist, lettre, cause }) => (
          <li key={r.code}>
            <Goutte lettre={lettre} petite />
            <div>
              <p className="rl-nom">
                <Link to={`/reseau/${r.code}`}>
                  <NomCoupable nom={nom} />
                </Link>
              </p>
              <p className="rl-meta">
                {fmt.nb(r.communes.length, 'commune du service', 'communes du service')}
                {dist && dist !== distPrincipal && ` · distributeur ${dist}`}
              </p>
            </div>
            <p className="rl-situation">
              <b>{lettre ? TITRES_NOTE[lettre] : 'Pas de note'}</b>
              {` — ${cause}`}
            </p>
          </li>
        ))}
      </ul>
      <p className="cap reseaux-note">
        Note calculée par le site selon la méthode de l’indicateur de l’ARS ; la synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi.
        La note porte sur l’ensemble des prélèvements du réseau, y compris ceux des communes qu’il dessert hors du service.{' '}
        <Link to="/methode#classe-ars">Calcul de la note</Link>.
      </p>
    </div>
  )
}

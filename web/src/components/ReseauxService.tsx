import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import type { ReseauDuService } from '../lib/service'
import { renseigne } from '../lib/sispea'
import { situationReseau, type SituationsFile } from '../lib/situations'
import Voyant from './Voyant'

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
 * « X / N réseaux non conformes ». La couleur de jugement est réservée aux réseaux, un par un, selon le
 * sémaphore des bilans officiels (toneSituation) ; l'agrégat reste sans couleur. Une ligne par réseau, voyant en
 * tête (maquette du 23/09, « Ses réseaux en {année} ») : le statut est écrit, le voyant n'en est que la forme.
 */
export default function ReseauxService({ reseaux, situ, annee }: { reseaux: readonly ReseauDuService[]; situ: SituationsFile; annee: string }) {
  if (!reseaux.length) return <p className="muted">Aucun réseau rattaché aux communes du service en {annee}.</p>
  const lignes = reseaux
    .map((r) => ({ r, nom: r.info.nom ?? r.code, dist: renseigne(r.info.dist), s: situationReseau(situ.reseaux[r.code]) }))
    // Du plus défavorable au plus favorable, les réseaux sans analyse en dernier.
    .sort((a, b) => (b.s.classe ?? -1) - (a.s.classe ?? -1) || a.nom.localeCompare(b.nom, 'fr'))
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
          Distribution : {distPrincipal}
          {exceptions ? ', sauf mention contraire' : ''}.
        </p>
      )}
      <ul className="reseaux-lignes" aria-label={`Réseaux qui desservent les communes du service en ${annee}, du plus défavorable au plus favorable`}>
        {lignes.map(({ r, nom, dist, s }) => (
          <li key={r.code}>
            <Voyant ton={s.ton} taille={16} />
            <div>
              <p className="rl-nom">
                <Link to={`/reseau/${r.code}`}>
                  <NomCoupable nom={nom} />
                </Link>
              </p>
              <p className="rl-meta">
                {fmt.nb(r.communes.length, 'commune du service', 'communes du service')}
                {dist && dist !== distPrincipal && ` · distribution ${dist}`}
              </p>
            </div>
            <p className="rl-situation">
              <b>{s.statut}</b>
              {s.detail && ` — ${s.detail}`}
            </p>
          </li>
        ))}
      </ul>
      <p className="cap reseaux-note">
        Chaque réseau est jugé selon la méthode du bilan officiel de chaque famille, sur tous ses prélèvements : un réseau peut aussi desservir des
        communes hors du service. <Link to="/methode">Comment c’est établi</Link>.
      </p>
    </div>
  )
}

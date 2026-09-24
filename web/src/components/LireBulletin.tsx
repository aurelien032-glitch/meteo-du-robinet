import { instrument, TEXTES_FAMILLES, valeursReseau } from '../lib/instruments'
import { FAMILLES_SITU } from '../lib/situations'
import Jauge from './Jauge'
import Paliers from './Paliers'
import Voyant from './Voyant'

const SANS_VALEUR = valeursReseau(undefined, {})

/**
 * « Lire un bulletin » (maquette du 23/09) : ce que dit chaque voyant, puis l'échelle de chaque famille, graduée
 * aux seuils de son bilan officiel. Page Méthode, puis accueil.
 */
export default function LireBulletin() {
  return (
    <section className="card lire-bulletin" aria-labelledby="lire-bulletin">
      <h2 id="lire-bulletin">Lire un bulletin</h2>
      <p>
        Chaque famille de paramètres est jugée selon la méthode de son bilan officiel, sur sa propre échelle. La couleur n’apparaît que lorsqu’un
        réseau est jugé.
      </p>
      <ul className="grammaire">
        <li className="tone-good">
          <Voyant ton="good" taille={24} />
          <strong>Conforme</strong>
          <span>Aucune limite de qualité dépassée selon les bilans. Une réserve est nommée quand une classe intermédiaire figure au détail.</span>
        </li>
        <li className="tone-warn">
          <Voyant ton="warn" taille={24} />
          <strong>Non conforme</strong>
          <span>Au moins un dépassement retenu par le bilan de la famille.</span>
        </li>
        <li className="tone-bad">
          <Voyant ton="bad" taille={24} />
          <strong>Restriction</strong>
          <span>Consommation restreinte : classe de restriction du bilan, ou avis de l’ARS.</span>
        </li>
        <li className="tone-na">
          <Voyant ton={null} taille={24} />
          <strong>Non analysée</strong>
          <span>Aucune analyse de la famille sur ce réseau dans l’année.</span>
        </li>
      </ul>
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span style={{ background: 'var(--m2)' }} />
          <span style={{ background: 'var(--m3)' }} />
          <span style={{ background: 'var(--m4)' }} />
        </span>
        Les chiffres agrégés (France, département, service d’eau) restent en gris : ce sont des statistiques descriptives, pas des jugements.
      </p>
      <div className="legende-familles">
        {FAMILLES_SITU.map((f) => {
          const e = instrument(f, null, SANS_VALEUR).echelle
          const t = TEXTES_FAMILLES[f]
          return (
            <div className="legende-famille" key={f}>
              <div>
                <h3>{t.titre}</h3>
                <p className="methode">{t.methode}</p>
              </div>
              {e.forme === 'reglette' ? <Jauge reglette={e} ton={null} nom={t.titre} /> : <Paliers classes={e.classes} actif={null} nom={t.titre} />}
              <p className="lecture">{t.lecture}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

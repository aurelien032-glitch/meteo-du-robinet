import { useId } from 'react'
import { Link } from 'react-router-dom'
import Voyant from './Voyant'
import { etatTon } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { avisMoment, MENTION_PRUDENCE, resultatsMoment, type DonneesMoment } from '../lib/enCeMoment'
import { NBSP } from '../lib/instruments'

/** Pictogramme d'information, neutre : ni jugement ni alerte (pas d'avis, pas d'information, pas de données). */
function Info() {
  return (
    <svg className="cf-info" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.1" />
    </svg>
  )
}

/**
 * Carte « En ce moment » des fiches commune et réseau (maquettes du 2026-10-05) : les avis de l'ARS de l'année en cours,
 * attribués, datés et cités, puis les derniers résultats. Indépendante de l'année du bilan : elle porte sa propre date
 * (règle « Ordre de l'année ») et se place hors de la portée de la barre d'année. Le site n'y répond à aucune question
 * sanitaire : il rapporte ce que l'ARS a publié (lib/enCeMoment.ts).
 */
export default function EnCeMoment(d: DonneesMoment) {
  const id = useId()
  const avis = avisMoment(d)
  const res = resultatsMoment(d)
  return (
    <section className="carte-fiche moment" aria-labelledby={`${id}-t`}>
      <div className="cf-tete">
        <p className="cf-sur">En ce moment</p>
        {d.arret ? (
          <p className="cf-date">
            données de l’ARS arrêtées au{NBSP}
            {fmt.date(d.arret)}
          </p>
        ) : (
          d.annee && <p className="cf-date">année {d.annee}</p>
        )}
      </div>
      <h2 className="cf-titre" id={`${id}-t`}>
        Avis de l’ARS sur la consommation
      </h2>

      {avis.etat === 'avis' ? (
        <>
          <div className="cf-principal">
            <Voyant ton={avis.ton} taille={34} />
            <p className="cf-phrase">{avis.phrase}</p>
          </div>
          <p className="cf-texte">{avis.periode}</p>
          {avis.autres.map((t) => (
            <p className="cf-texte" key={t}>
              {t}
            </p>
          ))}
          {avis.citation && (
            <figure className={`cf-citation tone-${avis.ton ?? 'neutre'}`}>
              <blockquote>
                <p>« {avis.citation.texte} »</p>
              </blockquote>
              <figcaption>
                Conclusion de l’ARS, prélèvement du {fmt.date(avis.citation.date)}
                {avis.citation.reseau && `, ${avis.citation.reseau}`}
              </figcaption>
            </figure>
          )}
        </>
      ) : (
        <>
          <div className="cf-principal">
            <Info />
            <p className="cf-phrase">{avis.phrase}</p>
          </div>
          {(avis.etat === 'sans-information' || avis.etat === 'sans-donnees') && avis.explication && <p className="cf-texte">{avis.explication}</p>}
        </>
      )}
      <p className="cf-prudence">{MENTION_PRUDENCE}</p>

      {d.annee && (
        <div className="cf-resultats">
          <h3 className="cf-sous">Derniers résultats de {d.annee}</h3>
          {res.etat === 'familles' ? (
            <ul className="cf-familles">
              {res.lignes.map((l) => (
                <li key={l.famille}>
                  <Voyant ton={l.ton} taille={18} />
                  <span>
                    {l.texte}
                    <span className="sr-only"> — {etatTon(l.ton, true)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cf-texte">{res.phrase}</p>
          )}
          {res.etat !== 'sans-donnees' && res.dernier && (
            <p className="cap">
              {res.etat === 'familles' && `${fmt.nb(res.prelevements, 'prélèvement')} depuis le 1er janvier ; `}
              dernier prélèvement le {fmt.date(res.dernier)}.
            </p>
          )}
          {/* Le détail des avis de l'année en cours est celui du bulletin de cette année (« Le détail par famille »). */}
          {res.etat !== 'sans-donnees' && (
            <Link className="link-arrow" to={{ search: `?annee=${d.annee}`, hash: '#avis' }}>
              Voir les avis de l’ARS et leurs dates <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

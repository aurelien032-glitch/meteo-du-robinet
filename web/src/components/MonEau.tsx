import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { avisSimple, periodes, phraseNote, TITRES_GROUPES, TITRES_NOTE, type CaseEau, type EtatCase, type GroupeCase, type ResultatsSimples } from '../lib/monEau'
import type { AvisMoment } from '../lib/enCeMoment'
import type { ReseauBulletin } from '../lib/bulletin'
import { RESEAU_DU_LOGEMENT, urlInfofacture } from '../lib/bilan'
import type { LettreArs } from '../lib/situations'
import { estPartiel } from '../lib/situations'

/**
 * Fiche « Mon eau » (refonte complète du 2026-10-05, complétée le même jour : « il manque des sections et des détails ») :
 * blocs que les fiches commune et réseau assemblent avec « Pourquoi la note », le mois par mois, le prix et la ressource.
 * - AvisEau : avis de l'ARS de l'année en cours, daté et attribué, et derniers résultats depuis le 1er janvier ;
 * - NoteEau : tous les réseaux de la commune avec leur lettre, la note du réseau choisi sur son échelle, son évolution ;
 * - CasesEau : une case par question d'habitant, qui s'ouvre sur une explication courte.
 * Logique et textes : lib/monEau.ts.
 */

const LETTRES: LettreArs[] = ['A', 'B', 'C', 'D']
const MOTS: Record<LettreArs, string> = { A: 'bonne', B: 'convenable', C: 'insuffisante', D: 'mauvaise' }
const GROUPES: GroupeCase[] = ['note', 'quotidien', 'aussi']

/** Goutte portant la note : la forme de l'eau, la lettre de l'indicateur de l'ARS au centre. */
export function Goutte({ lettre, petite = false }: { lettre: LettreArs | null; petite?: boolean }) {
  return (
    <svg
      className={`me-goutte${petite ? ' me-goutte-petite' : ''} note-${lettre ?? 'na'}`}
      viewBox="0 0 96 118"
      role="img"
      aria-label={lettre ? `Note ${lettre} : ${TITRES_NOTE[lettre].toLowerCase()}` : 'Pas de note'}
    >
      <path d="M48 4C66 28 88 52 88 74a40 40 0 0 1-80 0C8 52 30 28 48 4Z" />
      <text x="48" y="93" textAnchor="middle">
        {lettre ?? '–'}
      </text>
    </svg>
  )
}

function Etat({ etat }: { etat: EtatCase }) {
  if (etat === 'bon')
    return (
      <svg className="me-etat" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" className="me-etat-bon" />
        <path d="M6 10.5l2.6 2.5L14 7.5" fill="none" stroke="#fff" strokeWidth="2" />
      </svg>
    )
  if (etat === 'alerte')
    return (
      <svg className="me-etat" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2 18.5 17h-17L10 2Z" className="me-etat-alerte" />
      </svg>
    )
  if (etat === 'grave')
    return (
      <svg className="me-etat" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6.3 1.5h7.4l5.3 5.3v6.4l-5.3 5.3H6.3L1 13.2V6.8z" className="me-etat-grave" />
      </svg>
    )
  return null
}

const MOT_ETAT: Record<EtatCase, string> = { bon: 'sous la limite ou conforme', alerte: 'limite dépassée', grave: 'avis de l’ARS', neutre: 'information', absent: 'pas de mesure' }

/** Avis de l'ARS de l'année en cours et derniers résultats depuis le 1er janvier : hors de la portée de l'année du bilan. */
export function AvisEau({
  avis,
  arret,
  annee,
  resultats,
  reseau,
}: {
  avis: AvisMoment | null
  arret: string | undefined
  annee: string | undefined
  resultats: ResultatsSimples | null
  /** réseau des derniers contrôles, nommé quand la commune en a plusieurs */
  reseau?: string
}) {
  const id = useId()
  const a = avis ? avisSimple(avis, arret) : null
  if (!a) return null
  return (
    <section className={`me-avis me-avis-${a.ton}`} aria-labelledby={`${id}-avis`}>
      <p className="me-sur">En ce moment</p>
      <h2 id={`${id}-avis`}>{a.titre}</h2>
      <p className="me-avis-texte">{a.texte}</p>
      {a.details.map((t) => (
        <p className="me-avis-detail" key={t}>
          {t}
        </p>
      ))}
      {a.suite && <p className="me-petit">{a.suite}</p>}
      {a.citation && (
        <details>
          <summary>Lire le texte de l’ARS</summary>
          <blockquote>« {a.citation.texte} »</blockquote>
          <p className="me-petit">{a.citation.source}</p>
        </details>
      )}
      {annee && resultats && (
        <div className="me-resultats">
          <h3>
            Derniers contrôles {reseau ? `du réseau ${reseau} ` : ''}depuis le 1er janvier {annee}
          </h3>
          {resultats.lignes.length ? (
            <ul>
              {resultats.lignes.map((l) => (
                <li key={l.cle}>
                  <Etat etat={l.etat} />
                  <span>
                    <b>{l.titre}</b> : {l.reponse.charAt(0).toLowerCase() + l.reponse.slice(1)}
                    <span className="sr-only"> ({MOT_ETAT[l.etat]})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{resultats.phrase}</p>
          )}
          {resultats.dernier && (
            <p className="me-petit">
              {fmt.nb(resultats.prelevements, 'prélèvement')} ; dernier le {fmt.date(resultats.dernier)}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export interface AnneeNote {
  annee: string
  libelle: string
  lettre: LettreArs | null
}

/**
 * La note : tous les réseaux de la commune avec leur lettre (choisir un réseau change la note, les cases et les séries),
 * la note du réseau choisi sur l'échelle A–D, sa phrase, et l'historique de ses notes sur les années publiées, en
 * lecture : l'année de la fiche se choisit dans la barre « Année du bilan », au-dessus (critique UX du 2026-10-05).
 */
export function NoteEau({
  reseaux,
  choisi,
  surChoix,
  annee,
  evolution,
}: {
  reseaux: ReseauBulletin[]
  choisi: string | null
  surChoix: (code: string) => void
  annee: string
  evolution: AnneeNote[]
}) {
  const id = useId()
  const r = reseaux.find((x) => x.code === choisi) ?? reseaux[0]
  if (!r) return null
  const lettre = r.ars?.classe ?? null
  const phrase = phraseNote({ lettre, familles: r.ars?.familles ?? {}, reportees: r.ars?.reportees ?? [], situation: r.situation, annee })
  const pdf = urlInfofacture(r.code, annee)
  return (
    <section className="me-note-bloc" aria-labelledby={`${id}-note`}>
      {reseaux.length > 1 && (
        <div className="me-reseaux">
          <h2>Les {reseaux.length} réseaux de la commune</h2>
          <p className="me-aide">{RESEAU_DU_LOGEMENT}</p>
          <ul>
            {reseaux.map((x) => (
              <li key={x.code}>
                <button type="button" aria-pressed={x.code === r.code} onClick={() => surChoix(x.code)}>
                  <Goutte lettre={x.ars?.classe ?? null} petite />
                  <span>
                    <b>{x.nom}</b>
                    <span>{x.ars ? TITRES_NOTE[x.ars.classe] : 'Pas de note'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="me-note">
        <Goutte lettre={lettre} />
        <div className="me-note-texte">
          <p className="me-sur">
            {reseaux.length > 1 ? `${r.nom} · ` : ''}Note de l’eau {periodes(annee).periode}
          </p>
          <h2 id={`${id}-note`}>{lettre ? TITRES_NOTE[lettre] : 'Pas de note'}</h2>
          <p>{phrase}</p>
          {/* Année en cours, ouverte par défaut (2026-10-06) : la note porte sur les prélèvements publiés à ce jour. */}
          {lettre && estPartiel(annee) && (
            <p className="me-petit">Note provisoire : elle porte sur les prélèvements publiés depuis le 1er janvier {annee} et peut changer d’ici la fin de l’année.</p>
          )}
        </div>
        <ol className="me-echelle" aria-label="Échelle des notes, de A à D">
          {LETTRES.map((l) => (
            <li key={l} className={`note-${l}${l === lettre ? ' me-actuelle' : ''}`} aria-current={l === lettre ? 'true' : undefined}>
              <b>{l}</b>
              <span>{MOTS[l]}</span>
            </li>
          ))}
        </ol>
        {evolution.length > 1 && (
          <div className="me-evolution">
            <h3>Notes des années publiées</h3>
            <ol>
              {evolution.map((e) => (
                <li key={e.annee} aria-current={e.annee === annee ? 'true' : undefined}>
                  <Goutte lettre={e.lettre} petite />
                  <span>{e.libelle}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="me-petit">
          Note calculée par le site selon la méthode de l’indicateur de l’ARS. La synthèse annuelle de l’ARS, jointe à la facture d’eau, fait foi.
          {pdf && (
            <>
              {' '}
              <a href={pdf} target="_blank" rel="noopener noreferrer">
                Synthèse de l’ARS (PDF)
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  )
}

/** « Ce qu'on trouve dans votre eau » : une case par question, qui s'ouvre sur une explication courte et sa source. */
export function CasesEau({ cases, annee }: { cases: CaseEau[]; annee: string }) {
  const id = useId()
  const [ouverte, ouvrir] = useState<CaseEau['cle'] | null>(null)
  const detail = cases.find((c) => c.cle === ouverte)
  return (
    <section className="me-cases-bloc" aria-labelledby={`${id}-cases`}>
      <h2 id={`${id}-cases`}>Résultats du contrôle sanitaire {periodes(annee).periode}</h2>
      {GROUPES.map((g) => {
        const du = cases.filter((c) => c.groupe === g)
        if (!du.length) return null
        return (
          <div className="me-groupe" key={g}>
            <h3>{TITRES_GROUPES[g]}</h3>
            <div className="me-cases">
              {du.map((c) => (
                <button
                  key={c.cle}
                  type="button"
                  className={`me-case me-${c.etat}`}
                  aria-expanded={ouverte === c.cle}
                  aria-controls={`${id}-detail`}
                  style={{ animationDelay: `${cases.indexOf(c) * 40}ms` }}
                  onClick={() => ouvrir(ouverte === c.cle ? null : c.cle)}
                >
                  <span className="me-case-titre">{c.titre}</span>
                  <span className="me-case-reponse">
                    <Etat etat={c.etat} />
                    {c.reponse}
                    <span className="sr-only"> ({MOT_ETAT[c.etat]})</span>
                  </span>
                  {c.precision && <span className="me-case-precision">{c.precision}</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div id={`${id}-detail`} aria-live="polite">
        {detail && (
          <section className="me-detail" aria-label={detail.titre}>
            <div className="me-detail-tete">
              <h3>{detail.titre}</h3>
              <button type="button" className="btn-link" onClick={() => ouvrir(null)}>
                Fermer
              </button>
            </div>
            {detail.explication.map((l) => (
              <p key={l}>{l}</p>
            ))}
            {detail.lien && (
              <p>
                <Link to={detail.lien.to}>{detail.lien.texte}</Link>
              </p>
            )}
            <p className="me-petit">Source : {detail.source}</p>
          </section>
        )}
      </div>
    </section>
  )
}

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import Jauge from './Jauge'
import Paliers from './Paliers'
import Tag from './Tag'
import Voyant from './Voyant'
import { periode, phraseSansInformation, toneAvis, type GroupeAvis } from '../lib/avis'
import { etatTon, ordreReseaux, phraseVerdict, texteVerdict, tonBulletin, type Comptes, type ReseauBulletin } from '../lib/bulletin'
import { accord, fmt } from '../lib/data'
import { causeInstrument, instrumentsReseau, TEXTES_FAMILLES, type Instrument } from '../lib/instruments'
import { synthese } from '../lib/situations'
import { AVIS_LIBELLE, type CommuneYearStats, type ParamInfo } from '../lib/types'

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sansTon = <T,>(t: T | 'na') => (t === 'na' ? null : t)

/** Ligne d'une famille : voyant, nom et classe, instrument, et ce qui est en cause. */
function LigneFamille({ i }: { i: Instrument }) {
  const t = TEXTES_FAMILLES[i.famille]
  const cause = causeInstrument(i)
  return (
    <div className="fam">
      <div className="fam-id">
        <Voyant ton={i.ton} taille={16} />
        <div>
          <div className="fam-name">{t.titre}</div>
          <div className="fam-status">
            {i.libelle}
            <span className="sr-only"> — {etatTon(i.ton, true)}</span>
          </div>
        </div>
      </div>
      <div>
        {i.echelle.forme === 'reglette' ? (
          <Jauge reglette={i.echelle} ton={i.ton} nom={t.titre} libelle={i.libelle} />
        ) : (
          <Paliers classes={i.echelle.classes} actif={i.echelle.actif} nom={t.titre} />
        )}
      </div>
      {cause && (
        <p className="fam-cause">
          {cause.gras && (
            <>
              <b>{cause.gras}</b> :{' '}
            </>
          )}
          {cause.texte}
        </p>
      )}
    </div>
  )
}

/**
 * Bulletin d'une commune ou d'un réseau (maquette « vigilance + instruments » du 23/09) : la réponse à la question
 * en une phrase et un voyant, les instruments du réseau affiché — le plus défavorable d'office, les autres en onglets —,
 * les avis de l'ARS de l'année et les comptes. Toute l'année affichée : la barre d'année le précède.
 */
export default function Bulletin({
  question,
  annee,
  reseaux,
  stats,
  params,
  avis,
  sansInfo,
  comptes,
  desservi = 'la commune',
  choisi: choisiParent,
  surChoix,
}: {
  question: string
  annee: string
  reseaux: ReseauBulletin[]
  /** statistiques de l'année d'un réseau, pour ses instruments */
  stats: (code: string) => CommuneYearStats | undefined
  params: Record<string, ParamInfo>
  /** avis de l'ARS de l'année, regroupés par formulation (lib/avis.ts) */
  avis: GroupeAvis[]
  /**
   * délégations de l'ARS dont aucune conclusion de l'année n'évoque de consigne (lib/avis.ts, sansInformation) : leurs
   * conclusions et « de l’Isère » ; sans avis, le bloc dit alors « pas d'information », jamais « aucun avis »
   */
  sansInfo?: { conclusions: number; lieux: string } | null
  comptes: Comptes | null
  /** complète « réseaux qui desservent … » */
  desservi?: string
  /** réseau affiché, quand la page le partage (la série mensuelle de la fiche commune suit l'onglet choisi) */
  choisi?: string | null
  surChoix?: (code: string) => void
}) {
  const id = useId()
  const s = useMemo(() => synthese(reseaux.map((r) => r.situation)), [reseaux])
  const ordre = useMemo(() => ordreReseaux(reseaux), [reseaux])
  const [choixInterne, setChoixInterne] = useState<string | null>(null)
  const choisi = surChoix ? (choisiParent ?? null) : choixInterne
  const setChoisi = surChoix ?? setChoixInterne
  const onglets = useRef<(HTMLButtonElement | null)[]>([])
  const affiche = ordre.find((r) => r.code === choisi) ?? ordre[0]
  const rang = affiche ? ordre.indexOf(affiche) : -1
  const multi = ordre.length > 1
  const titre = phraseVerdict(s, annee)
  const texte = texteVerdict(reseaux, desservi)
  const noms = new Map(reseaux.map((r) => [r.code, r.nom.trim()]))
  const instruments = affiche ? instrumentsReseau(stats(affiche.code), affiche.situation, params) : []

  // Onglets (motif ARIA « tabs ») : flèches, début et fin ; le réseau choisi reçoit le focus.
  const clavier = (e: KeyboardEvent, i: number) => {
    const n = ordre.length
    const cible = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key]
    if (cible == null) return
    e.preventDefault()
    setChoisi(ordre[cible].code)
    onglets.current[cible]?.focus()
  }

  return (
    <article className="bulletin" aria-labelledby={`${id}-q`}>
      <h2 className="b-q" id={`${id}-q`}>
        {question} <span className="b-y">bilan {annee}</span>
      </h2>
      <div className="b-head">
        <Voyant ton={sansTon(tonBulletin(s))} taille={48} />
        <div>
          <p className="b-verdict">{titre ?? `Aucune famille analysée en ${annee}`}</p>
          {texte && <p>{texte}</p>}
        </div>
      </div>

      {multi && (
        <div className="rpick-wrap">
          <p className="cap">
            Chaque réseau est jugé séparément ; le bulletin retient le plus défavorable des {ordre.length}. Choisissez un réseau pour lire ses
            instruments.
          </p>
          <div className="rpick" role="tablist" aria-label="Réseau affiché">
            {ordre.map((r, i) => {
              const ton = tonBulletin(synthese([r.situation]))
              const actif = i === rang
              return (
                <button
                  key={r.code}
                  ref={(el) => {
                    onglets.current[i] = el
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-t${i}`}
                  aria-controls={`${id}-fams`}
                  aria-selected={actif}
                  tabIndex={actif ? 0 : -1}
                  onClick={() => setChoisi(r.code)}
                  onKeyDown={(e) => clavier(e, i)}
                >
                  <Voyant ton={sansTon(ton)} taille={14} />
                  <span>{r.nom.trim()}</span>
                  <span className="sr-only"> — {etatTon(ton)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {multi && affiche && (
        <p className="rpick-now">
          Instruments du réseau <b>{affiche.nom.trim()}</b>
        </p>
      )}
      <div
        className="fams"
        id={`${id}-fams`}
        role={multi ? 'tabpanel' : undefined}
        aria-labelledby={multi ? `${id}-t${rang}` : undefined}
        tabIndex={multi ? 0 : undefined}
      >
        {instruments.map((i) => (
          <LigneFamille key={i.famille} i={i} />
        ))}
      </div>

      <div className="b-avis" id="avis">
        <p className="b-sub">Avis de l’ARS en {annee}</p>
        {avis.length ? (
          <ul className="b-avis-liste">
            {avis.map((a) => (
              <li key={a.id}>
                <Tag ton={toneAvis(a.cat, a.local)}>{majuscule(AVIS_LIBELLE[a.cat])}</Tag>
                <span className="cap">
                  {majuscule(periode(a.debut, a.fin))} · {fmt.nb(a.n, 'prélèvement')}
                  {a.causes.length > 0 && ` · ${a.causes.join(', ')}`}
                  {a.local && ' · limité à un bâtiment, un point d’usage ou au seul point de prélèvement'}
                  {multi && a.reseaux.length > 0 && ` · ${accord(a.reseaux.length, 'réseau', 'réseaux')} ${a.reseaux.map((c) => noms.get(c) ?? c).join(', ')}`}
                </span>
                <details>
                  <summary>Conclusion de l’ARS</summary>
                  <blockquote>{a.texte}</blockquote>
                </details>
              </li>
            ))}
          </ul>
        ) : sansInfo ? (
          // Pas de ton : c'est une limite des données, pas un jugement sur l'eau (grammaire des couleurs du 23/09).
          <p className="b-sans-info">
            <b>Pas d’information sur les consignes.</b> {phraseSansInformation(annee, sansInfo.conclusions, sansInfo.lieux)}
          </p>
        ) : (
          <p className="muted">Aucun avis : ni restriction, ni consigne d’ébullition, ni recommandation pour les publics sensibles.</p>
        )}
      </div>

      <div className="b-foot">
        {comptes && (
          <p className="counts">
            <b>{fmt.int(comptes.prelevements)}</b> {accord(comptes.prelevements, 'prélèvement')} · <b>{fmt.int(comptes.analyses)}</b>{' '}
            {accord(comptes.analyses, 'analyse')} ·{' '}
            {comptes.depassements ? (
              <>
                <b>{fmt.int(comptes.depassements)}</b> au-dessus d’une limite
              </>
            ) : (
              'aucune au-dessus d’une limite'
            )}
            {multi && <span className="cap"> (les {ordre.length} réseaux)</span>}
          </p>
        )}
        <Link className="link-arrow" to="/methode">
          Comment ce bulletin est établi <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}

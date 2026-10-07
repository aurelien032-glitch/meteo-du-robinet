import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Chargement from './Chargement'
import { Goutte } from './MonEau'
import Paliers from './Paliers'
import {
  comptesClasses,
  comptesSecheresse,
  dateAvis,
  legendeSecheresse,
  partClasse,
  PHRASE_SECHERESSE_FRANCE,
  phraseNonClasses,
  phrasePrix,
  pctInsecable,
  prixSispea,
  teteSecheresse,
  texteConsignes,
  texteRepartition,
  type ComptesClasses,
} from '../lib/accueil'
import { LETTRES_ARS } from '../lib/bilan'
import type { ReseauBulletin } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { comptesParDepartement } from '../lib/france'
import { useJsonAll } from '../lib/hooks'
import { TITRES_NOTE, type AvisSimple } from '../lib/monEau'
import type { ServiceCommune } from '../lib/sispea'
import { estPartiel, type LettreArs, type SituationsFile } from '../lib/situations'
import { jetonsEtats } from '../lib/theme'
import type { MetaFile, SispeaNationalFile } from '../lib/types'
import { NIVEAUX_SECHERESSE, rangNiveau, secheresseCommune, TONS_SECHERESSE, TYPES_ZONE, useVigiEau, useVigiEauDepartements } from '../lib/vigieau'
import { anneesFiche, type AnneeFiche } from '../lib/year'

/*
 * Cartes des fiches, dans l'ordre de l'habitant (maquette validée par l'auteur le 2026-10-06, canevas « Vision
 * d'ensemble ») : la qualité de l'eau, avec l'année ; la sécheresse du jour ; le prix et qui gère l'eau ; puis « Pour en
 * savoir plus », dont chaque ligne s'ouvre sur place. Style : chaque bloc dans sa carte délimitée, une valeur clé et une
 * ligne de contexte, la couleur réservée à ce qui juge ou alerte (« éviter de surcharger l'œil », « il faut bien
 * délimiter »).
 */

/** Carte délimitée : un titre court en petites capitales, et à droite sa date ou son sélecteur. */
export function Carte({ titre, aDroite, id, className, children }: { titre: string; aDroite?: ReactNode; id?: string; className?: string; children: ReactNode }) {
  const i = useId()
  return (
    <section className={`carte2${className ? ` ${className}` : ''}`} aria-labelledby={`${i}-t`} id={id}>
      <div className="carte2-tete">
        <h2 className="carte2-titre" id={`${i}-t`}>
          {titre}
        </h2>
        {aDroite}
      </div>
      {children}
    </section>
  )
}

/** Années du bilan en onglets légers : toutes les années publiées, l'année en cours dite aux lecteurs d'écran. */
export function OngletsAnnee({ annees, annee, onChange }: { annees: AnneeFiche[]; annee: number | undefined; onChange: (a: number) => void }) {
  return (
    <div className="onglets-annee" role="group" aria-label="Année du bilan">
      {annees.map((a) => (
        <button key={a.annee} type="button" aria-pressed={a.annee === annee} disabled={a.sansDonnees} onClick={() => onChange(a.annee)}>
          {a.annee}
          {a.enCours && <span className="sr-only"> (en cours)</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * La qualité de l'eau : la note de chaque réseau pour l'année choisie, puis l'avis de l'ARS de l'année en cours, daté.
 * Choisir un réseau gouverne « Pour en savoir plus ».
 */
export function CarteQualite({
  reseaux,
  choisi,
  surChoix,
  annee,
  annees,
  onAnnee,
  avis,
  ancreAvis,
  vide,
}: {
  reseaux: ReseauBulletin[]
  choisi: string | null
  surChoix: (code: string) => void
  annee: string
  annees: AnneeFiche[]
  onAnnee: (a: number) => void
  avis: AvisSimple | null
  ancreAvis: string
  /** phrase quand aucun réseau n'est noté (fiche réseau : « Aucun contrôle n'est enregistré sur ce réseau… ») */
  vide?: string
}) {
  const plusieurs = reseaux.length > 1
  const actif = choisi ?? reseaux[0]?.code ?? null
  return (
    <Carte titre="Qualité de l’eau" aDroite={<OngletsAnnee annees={annees} annee={Number(annee)} onChange={onAnnee} />}>
      {reseaux.length ? (
        <ul className="gouttes-reseaux" data-n={Math.min(reseaux.length, 4)}>
          {reseaux.map((r) => {
            const contenu = (
              <>
                <Goutte lettre={r.ars?.classe ?? null} />
                <span className="gr-nom">{r.nom}</span>
                <span className="gr-mot">{r.ars ? TITRES_NOTE[r.ars.classe].toLowerCase() : 'pas de note'}</span>
              </>
            )
            return (
              <li key={r.code}>
                {plusieurs ? (
                  <button type="button" aria-pressed={r.code === actif} onClick={() => surChoix(r.code)}>
                    {contenu}
                  </button>
                ) : (
                  <div className="gr-seul">{contenu}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="carte2-ligne">{vide ?? `Aucun réseau n’est analysé ${estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`}.`}</p>
      )}
      <p className="carte2-note">
        {estPartiel(annee) ? `Notes provisoires depuis le 1er janvier ${annee}` : `Notes de ${annee}`}, calculées par le site selon la méthode de l’ARS ; la synthèse de
        l’ARS jointe à la facture d’eau fait foi.
      </p>
      {avis && (
        <p className={`carte2-avis carte2-avis--${avis.ton}`}>
          <span className="pastille-avis" aria-hidden="true" />
          <span>
            {avis.ligne} <a href={ancreAvis}>Lire</a>
          </span>
        </p>
      )}
    </Carte>
  )
}

/** Phrase d'un niveau de restriction sécheresse : ce qu'il change, et que l'eau du robinet n'est pas concernée. */
function phraseSecheresse(niveau: number): string {
  if (niveau === 0) return 'Aucune restriction en vigueur sur la commune.'
  if (niveau === 1) return 'Appel aux économies d’eau, sans restriction d’usage. L’eau du robinet n’est pas concernée.'
  return 'Certains usages sont restreints (arrosage, lavage, remplissage). L’eau du robinet n’est pas concernée.'
}

/**
 * La sécheresse du jour, interrogée en direct chez VigiEau : niveau le plus élevé sur la commune, son échelle, sa date.
 * `commune` : nom de la commune lue, dit quand la fiche en couvre plusieurs (fiche réseau : sa commune de tête).
 */
export function CarteSecheresse({ insee, commune }: { insee: string; commune?: string }) {
  const { zones, erreur } = useVigiEau(insee)
  const s = zones ? secheresseCommune(zones) : null
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Carte titre="Sécheresse aujourd’hui" aDroite={<span className="carte2-date">{aujourdhui}</span>}>
      {s ? (
        <>
          <p className="carte2-valeur">{s.niveau ? NIVEAUX_SECHERESSE[s.niveau] : 'Aucune restriction'}</p>
          {commune && <p className="carte2-note">Niveau en vigueur à {commune}, l’une des communes desservies par ce réseau.</p>}
          <Paliers
            classes={NIVEAUX_SECHERESSE.slice(1).map((t, i) => ({ t: t.toLowerCase(), ton: TONS_SECHERESSE[i + 1] }))}
            actif={s.niveau ? s.niveau - 1 : null}
            nom="Restrictions sécheresse"
            compact={false}
          />
          <p className="carte2-ligne">
            {phraseSecheresse(s.niveau)}
            {s.pire &&
              ` ${[TYPES_ZONE[s.pire.type] && TYPES_ZONE[s.pire.type][0].toUpperCase() + TYPES_ZONE[s.pire.type].slice(1), s.pire.arrete?.dateDebutValidite && `arrêté du ${fmt.date(s.pire.arrete.dateDebutValidite.slice(0, 10))}`]
                .filter(Boolean)
                .join(', ')}.`}
          </p>
        </>
      ) : erreur ? (
        <p className="carte2-ligne">
          {erreur.includes('plusieurs zones')
            ? 'VigiEau ne rattache pas cette commune à une zone unique.'
            : 'Le service VigiEau ne répond pas pour le moment.'}{' '}
          <Link to="/secheresse">Carte des restrictions</Link>
        </p>
      ) : (
        <p className="carte2-ligne muted">Interrogation de VigiEau…</p>
      )}
    </Carte>
  )
}

/** Le prix du m³ et qui gère l'eau, tels que le service les déclare à SISPEA. */
export function CartePrix({ service, plusieurs = false }: { service: ServiceCommune | null; plusieurs?: boolean }) {
  if (plusieurs)
    return (
      <Carte titre="Prix et gestion">
        <p className="carte2-ligne">Ce réseau dessert des communes de plusieurs services d’eau ; le prix figure sur la fiche de chaque commune.</p>
      </Carte>
    )
  const gestion = service?.mode === 'régie' ? 'en régie' : service?.mode === 'délégation' ? 'en gestion déléguée' : null
  return (
    <Carte titre="Prix et gestion" aDroite={service?.annee ? <span className="carte2-date">tarif {service.annee}</span> : undefined}>
      {service?.prix != null ? (
        <p className="carte2-valeur">
          {fmt.dec(service.prix, 2)}&nbsp;€ <span className="carte2-unite">le m³</span>
        </p>
      ) : (
        <p className="carte2-ligne">Le service d’eau n’a pas publié son prix.</p>
      )}
      {service ? (
        <p className="carte2-ligne">
          {service.nom}
          {gestion && `, ${gestion}`}
          {service.mode === 'délégation' && service.exploitant && ` (exploitant : ${service.exploitant})`}.
          {service.id && (
            <>
              {' '}
              <Link to={`/service/${service.id}`}>Le service d’eau</Link>
            </>
          )}
        </p>
      ) : (
        <p className="carte2-ligne">Aucun service d’eau n’est rattaché à cette commune dans SISPEA.</p>
      )}
    </Carte>
  )
}

export interface LigneSavoir {
  id: string
  titre: string
  /** contenu ouvert sur place ; sans contenu, `vers` mène à une page */
  contenu?: ReactNode
  vers?: string
  /** autres ancres qui ouvrent la ligne (#avis, #origine… des liens existants) */
  aussi?: string[]
  /** ouverte dès l'arrivée (fiche département : un indicateur de famille demandé par l'adresse) */
  ouvert?: boolean
}

/** Une ligne qui s'ouvre sur place : contenu monté à la première ouverture, ouverte par une ancre de l'adresse. */
function LigneOuvrante({ id, titre, contenu, aussi = [], ouvert: demande = false }: LigneSavoir) {
  const { hash } = useLocation()
  const vise = demande || hash === `#${id}` || aussi.some((a) => hash === `#${a}`)
  const [ouvert, setOuvert] = useState(vise)
  const [monte, setMonte] = useState(vise)
  useEffect(() => {
    if (vise) {
      setOuvert(true)
      setMonte(true)
    }
  }, [vise])
  return (
    <details
      className="savoir-ligne"
      id={id}
      open={ouvert}
      onToggle={(e) => {
        const o = e.currentTarget.open
        setOuvert(o)
        if (o) setMonte(true)
      }}
    >
      <summary>
        <span>{titre}</span>
        <span className="savoir-chevron" aria-hidden="true" />
      </summary>
      <div className="savoir-corps">{monte && contenu}</div>
    </details>
  )
}

/** « Pour en savoir plus » : le reste de la fiche, en lignes courtes ; chacune s'ouvre sur place ou mène à une page. */
export function SavoirPlus({ lignes }: { lignes: LigneSavoir[] }) {
  const i = useId()
  return (
    <section className="carte2 savoir" aria-labelledby={`${i}-t`}>
      <h2 className="carte2-titre" id={`${i}-t`}>
        Pour en savoir plus
      </h2>
      <ul>
        {lignes.map((l) => (
          <li key={l.id}>
            {l.contenu ? (
              <LigneOuvrante {...l} />
            ) : (
              <Link className="savoir-lien" to={l.vers ?? '#'}>
                <span>{l.titre}</span>
                <span className="savoir-fleche" aria-hidden="true">
                  ›
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// --- Cartes des agrégats (accueil, La France, fiche département ; lots 2 et 3 du parcours, 2026-10-07) ---------------

/** Barre empilée d'une répartition : une part par segment, aux couleurs de la palette de la carte, avec son texte équivalent. */
export function BarreParts({ parts, label }: { parts: { cle: string; part: number; jeton: string }[]; label: string }) {
  return (
    <div className="barre-parts" role="img" aria-label={label}>
      {parts
        .filter((p) => p.part > 0)
        .map((p) => (
          <span key={p.cle} style={{ flexGrow: p.part, background: `var(${p.jeton})` } as CSSProperties} />
        ))}
    </div>
  )
}

const JETONS_NOTES: Record<LettreArs, string> = { A: '--good', B: '--warn-line', C: '--warn', D: '--bad' }
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * La qualité de l'eau d'un ensemble de réseaux (France, département) : chiffre de tête, barre et légende A–D des notes
 * calculées comme sur les fiches (`comptesClasses`), carte facultative, puis les réseaux ayant fait l'objet d'une
 * restriction ou d'une consigne de l'ARS dans l'année, datés, et les délégations « sans information » (règle du 24/09).
 */
export function CarteNotesAgregat({
  annee,
  c,
  chiffre = 'A',
  legende = 'parts',
  onglets,
  carte,
  avis,
  muets,
  note,
}: {
  annee: string
  c: ComptesClasses
  /** chiffre de tête : part des réseaux notés A (France), ou notés C ou D (département, comme la carte de France) */
  chiffre?: 'A' | 'CD'
  /** légende en parts (accueil) ou en nombres de réseaux (La France, département) */
  legende?: 'parts' | 'comptes'
  onglets?: { annees: AnneeFiche[]; onAnnee: (a: number) => void }
  carte?: ReactNode
  /** réseaux ayant fait l'objet d'une restriction de consommation ou d'une consigne d'ébullition de l'ARS dans l'année */
  avis: { restriction: number; ebullition: number; arret?: string; lien: string } | null
  muets?: string | null
  note?: ReactNode
}) {
  const partiel = estPartiel(annee)
  const periode = partiel ? `depuis le 1er janvier ${annee}` : `en ${annee}`
  const part = chiffre === 'A' ? partClasse(c, 'A') : c.classes ? (c.C + c.D) / c.classes : null
  const nonClasses = phraseNonClasses(c)
  return (
    <Carte
      titre="Qualité de l’eau"
      aDroite={onglets ? <OngletsAnnee annees={onglets.annees} annee={Number(annee)} onChange={onglets.onAnnee} /> : <span className="carte2-date">{periode}</span>}
    >
      {c.classes ? (
        <>
          <p className="carte2-valeur">
            {part != null ? fmt.pct(100 * part, 1) : '–'}{' '}
            <span className="carte2-unite">
              {chiffre === 'A'
                ? legende === 'comptes'
                  ? `des ${fmt.int(c.classes)} réseaux ont la note A`
                  : 'des réseaux ont la note A'
                : `des ${fmt.int(c.classes)} réseaux sont notés C ou D`}
            </span>
          </p>
          <BarreParts parts={LETTRES_ARS.map((l) => ({ cle: l, part: c[l], jeton: JETONS_NOTES[l] }))} label={texteRepartition(c, annee)} />
          <ul className="legende-parts">
            {LETTRES_ARS.map((l) => (
              <li key={l}>
                <span className={`tuile-ars petite tuile-${l}`} aria-hidden="true">
                  {l}
                </span>
                <span className="sr-only">Note {l} : </span>
                {legende === 'comptes' ? fmt.nb(c[l], 'réseau', 'réseaux') : pctInsecable(100 * (partClasse(c, l) ?? 0), 1)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="carte2-ligne">Aucun réseau n’a de note calculée {periode}.</p>
      )}
      {carte}
      {avis && (
        <p className={`carte2-avis carte2-avis--${avis.restriction + avis.ebullition > 0 ? 'grave' : 'neutre'}`}>
          <span className="pastille-avis" aria-hidden="true" />
          <span>
            {texteConsignes(avis.restriction, avis.ebullition)} <span className="carte2-date-avis">{majuscule(dateAvis(annee, partiel, avis.arret))}.</span> <Link to={avis.lien}>Lire</Link>
          </span>
        </p>
      )}
      {muets && <p className="carte2-note">{muets}</p>}
      <p className="carte2-note">
        {partiel ? 'Notes provisoires' : 'Notes'}
        {c.classes ? ` de ${fmt.nb(c.classes, 'réseau', 'réseaux')}` : ''}, calculées par le site selon la méthode de l’ARS sur les prélèvements publiés {periode}. La
        synthèse de l’ARS jointe à la facture d’eau fait foi.{nonClasses && ` ${nonClasses}`}
      </p>
      {note}
    </Carte>
  )
}

/** Jetons de couleur des niveaux de sécheresse (palette de la carte, même règle que les échelles des fiches). */
const JETONS_SECHERESSE = jetonsEtats(TONS_SECHERESSE)

/** La sécheresse du jour en France, interrogée en direct chez VigiEau : départements par niveau le plus élevé. */
export function CarteSecheresseFrance() {
  const { depts, error } = useVigiEauDepartements()
  const c = useMemo(() => (depts ? comptesSecheresse(depts) : null), [depts])
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const tete = c ? teteSecheresse(c) : null
  const legende = c ? legendeSecheresse(c) : []
  return (
    <Carte titre="Sécheresse aujourd’hui" aDroite={<span className="carte2-date">{aujourdhui}</span>} className="carte2-reserve">
      {c && tete ? (
        <>
          <p className="carte2-valeur">
            {fmt.int(tete.n)} <span className="carte2-unite">{tete.texte}</span>
          </p>
          <BarreParts
            parts={legende.map((l) => ({ cle: String(l.niveau), part: l.n, jeton: JETONS_SECHERESSE[l.niveau] }))}
            label={`Départements par niveau de restriction le plus élevé : ${legende.map((l) => `${l.libelle}, ${l.n}`).join(' ; ')}`}
          />
          <p className="carte2-ligne">{legende.map((l) => `${majuscule(l.libelle)} ${fmt.int(l.n)}`).join(' · ')}</p>
          <p className="carte2-note">{PHRASE_SECHERESSE_FRANCE}</p>
          <p className="carte2-ligne">
            <Link to="/secheresse">La carte des restrictions</Link>
          </p>
        </>
      ) : error ? (
        <p className="carte2-ligne">
          Le service VigiEau ne répond pas pour le moment. <Link to="/secheresse">La carte des restrictions</Link>
        </p>
      ) : (
        <p className="carte2-ligne muted">Interrogation de VigiEau…</p>
      )}
    </Carte>
  )
}

/** La sécheresse du jour d'un département : son niveau le plus élevé (VigiEau), l'échelle des niveaux, la date. */
export function CarteSecheresseDepartement({ dd }: { dd: string }) {
  const { depts, error } = useVigiEauDepartements()
  const d = depts?.find((x) => x.code === dd)
  const niveau = d ? rangNiveau(d.niveauGraviteMax) : null
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <Carte titre="Sécheresse aujourd’hui" aDroite={<span className="carte2-date">{aujourdhui}</span>} className="carte2-reserve">
      {niveau != null ? (
        <>
          <p className="carte2-valeur">{niveau ? NIVEAUX_SECHERESSE[niveau] : 'Aucune restriction'}</p>
          <Paliers
            classes={NIVEAUX_SECHERESSE.slice(1).map((t, i) => ({ t: t.toLowerCase(), ton: TONS_SECHERESSE[i + 1] }))}
            actif={niveau ? niveau - 1 : null}
            nom="Restrictions sécheresse"
            compact={false}
          />
          <p className="carte2-ligne">
            {niveau
              ? 'Niveau le plus élevé sur au moins une zone du département, fixé par arrêté préfectoral. Ces restrictions limitent certains usages de l’eau (arrosage, lavage…) sans en restreindre la consommation.'
              : 'Aucune restriction en vigueur dans le département.'}
          </p>
          <p className="carte2-ligne">
            <Link to="/secheresse">La carte des restrictions</Link>
          </p>
        </>
      ) : error || depts ? (
        <p className="carte2-ligne">
          {error ? 'Le service VigiEau ne répond pas pour le moment.' : 'VigiEau ne donne pas de niveau pour ce département.'} <Link to="/secheresse">La carte des restrictions</Link>
        </p>
      ) : (
        <p className="carte2-ligne muted">Interrogation de VigiEau…</p>
      )}
    </Carte>
  )
}

/** Le prix de l'eau et la gestion des services, en France ou dans un département, d'après SISPEA. */
export function CartePrixAgregat({ nat, dd }: { nat: SispeaNationalFile | null; dd?: string }) {
  const p = prixSispea(nat, dd)
  return (
    <Carte titre="Prix et gestion" aDroite={p ? <span className="carte2-date">données {p.annee}</span> : undefined}>
      {p ? (
        <>
          <p className="carte2-valeur">
            {fmt.dec(p.moyen, 2)}&nbsp;€ <span className="carte2-unite">le m³, prix moyen</span>
          </p>
          <p className="carte2-ligne">{phrasePrix(p)}</p>
          <p className="carte2-ligne">
            <Link to={dd ? `/departement/${dd}#services` : '/services'}>{dd ? 'Les services d’eau du département' : 'Les services d’eau'}</Link>
          </p>
        </>
      ) : (
        <p className="carte2-ligne">Les chiffres des services d’eau ne sont pas disponibles{dd ? ' pour ce département' : ''}.</p>
      )}
    </Carte>
  )
}

/**
 * L'évolution des notes depuis la première année publiée, France ou département (`dd`) : une barre A–D par année, les
 * notes calculées comme pour l'année choisie. Les fichiers des années ne se chargent qu'à l'ouverture de la ligne.
 */
export function EvolutionNotes({ meta, dd }: { meta: MetaFile; dd?: string }) {
  const annees = anneesFiche(meta)
  const fichiers = useJsonAll<SituationsFile>(annees.map((a) => `situations/${a.annee}.json`))
  if (fichiers.loading || !fichiers.data) return <Chargement texte="Chargement des années…" />
  return (
    <ol className="evolution-notes">
      {annees.map((a, i) => {
        const s = fichiers.data?.[i]
        const c = s ? (dd ? (comptesParDepartement(s).get(dd) ?? null) : comptesClasses(s)) : null
        const libelle = a.enCours ? `${a.annee}, depuis le 1er janvier` : String(a.annee)
        return (
          <li key={a.annee}>
            <span className="en-annee">{libelle}</span>
            {c?.classes ? (
              <>
                <BarreParts parts={LETTRES_ARS.map((l) => ({ cle: l, part: c[l], jeton: JETONS_NOTES[l] }))} label={texteRepartition(c, a.annee)} />
                <span className="en-parts">{LETTRES_ARS.map((l) => `${l} ${pctInsecable(100 * (partClasse(c, l) ?? 0), 1)}`).join(' · ')}</span>
              </>
            ) : (
              <span className="en-parts">Aucun réseau noté.</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

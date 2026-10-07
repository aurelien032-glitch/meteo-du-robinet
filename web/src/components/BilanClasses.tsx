import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  eauDeClasse,
  LETTRES_ARS,
  LIBELLES_ARS,
  lignesBilan,
  NOTE_LIBELLES_ARS,
  phraseBilan,
  RESEAU_DU_LOGEMENT,
  urlInfofacture,
  type LigneBilan,
} from '../lib/bilan'
import { accord, fmt } from '../lib/data'
import type { Comptes, ReseauBulletin } from '../lib/bulletin'
import { estPartiel, type LettreArs } from '../lib/situations'
import { bilanDe } from '../lib/types'

/** Réseaux montrés d'office ; les autres se déplient (choix de l'auteur, 2026-10-05). */
const VISIBLES = 4

/** Tuile d'une classe : la lettre sur sa couleur, jamais la couleur seule (forme et lettre). */
export function TuileArs({ lettre, grande = false }: { lettre: LettreArs | null; grande?: boolean }) {
  return (
    <span className={`tuile-ars tuile-${lettre ?? 'na'}${grande ? ' grande' : ''}`} role="img" aria-label={lettre ? `Note ${lettre}` : 'Note non calculée'}>
      {lettre ?? '–'}
    </span>
  )
}

/** Lien vers la synthèse officielle de l'ARS (PDF public), nommée pour un réseau quand il y en a plusieurs. */
function LienSynthese({ code, annee, nom }: { code: string; annee: string; nom?: string }) {
  const url = urlInfofacture(code, annee)
  if (!url) return null
  return (
    <a href={url} rel="noopener">
      Synthèse officielle de l’ARS
      {nom && <span className="sr-only"> pour le réseau {nom}</span>} (PDF)
    </a>
  )
}

function Ligne({ l, annee }: { l: LigneBilan; annee: string }) {
  return (
    <li className="bilan-ligne">
      <TuileArs lettre={l.lettre} />
      <div>
        <p className="bl-nom">{l.nom}</p>
        <p className="bl-cause">{l.cause}</p>
        {urlInfofacture(l.code, annee) && (
          <p className="bl-lien">
            <LienSynthese code={l.code} annee={annee} nom={l.nom} />
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * Carte « Bilan <année> » (maquettes du 2026-10-05) : la classe A–D de chaque réseau, calculée par le site selon la
 * méthode de l'indicateur de l'ARS, avec sa cause courte (lib/bilan.ts). La barre d'année est en haut de la fiche,
 * au-dessus des deux cartes (choix de l'auteur, 2026-10-05) ; `barre` reste possible pour une carte seule. Un réseau : la tuile en grand et le libellé de l'indicateur ; plusieurs : une ligne chacun.
 */
export default function BilanClasses({
  annee,
  reseaux,
  comptes,
  barre,
  nommer = true,
  vide,
}: {
  annee: string
  /** réseaux de l'année, dans l'ordre de la page (ordreReseaux), noms lisibles */
  reseaux: ReseauBulletin[]
  /** comptes de l'année (un seul réseau : la phrase sous la classe) */
  comptes: Comptes | null
  barre: ReactNode
  /** un seul réseau : écrire son nom (fiche commune) ; la fiche réseau le porte déjà en titre */
  nommer?: boolean
  /** à la place du bilan : année sans prélèvement, ou chargement */
  vide?: ReactNode
}) {
  const id = useId()
  const [tout, setTout] = useState(false)
  const lignes = lignesBilan(reseaux, annee)
  const plusieurs = lignes.length > 1
  const visibles = tout ? lignes : lignes.slice(0, VISIBLES)
  const partiel = estPartiel(annee)
  const seul = !plusieurs ? lignes[0] : undefined
  return (
    <section className="carte-fiche bilan" id="bilan" aria-labelledby={`${id}-t`}>
      <div className="cf-tete">
        <p className="cf-sur">{bilanDe(annee, estPartiel(annee))}</p>
        <p className="cf-date">note calculée par le site</p>
      </div>
      {barre}
      <h2 className="cf-titre" id={`${id}-t`}>
        La qualité de l’eau en {annee}
      </h2>
      {vide ?? (
        <>
          <p className="cf-texte">
            {phraseBilan(plusieurs)}
            {partiel && ' Bilan partiel : prélèvements publiés depuis le 1er janvier.'}
          </p>

          {!lignes.length ? (
            <p className="cf-texte">Aucun réseau n’est rattaché à ce lieu en {annee}.</p>
          ) : seul ? (
            <div className="bilan-un">
              <TuileArs lettre={seul.lettre} grande />
              <div>
                {seul.lettre && <p className="bu-libelle">{eauDeClasse(seul.lettre)}</p>}
                {nommer && <p className="bl-nom-seul">Réseau {seul.nom}</p>}
                <p className="bl-cause">{seul.cause}</p>
                {comptes && (
                  <p className="bl-cause">
                    {fmt.int(comptes.analyses)} {accord(comptes.analyses, 'analyse')} {partiel ? 'depuis le 1er janvier' : `en ${annee}`},{' '}
                    {comptes.depassements ? `dont ${fmt.int(comptes.depassements)} au-dessus d’une limite de qualité` : 'aucune au-dessus d’une limite de qualité'}.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <ul className="bilan-reseaux" id={`${id}-l`}>
                {visibles.map((l) => (
                  <Ligne key={l.code} l={l} annee={annee} />
                ))}
              </ul>
              {lignes.length > VISIBLES && (
                <button type="button" className="btn" aria-expanded={tout} aria-controls={`${id}-l`} onClick={() => setTout(!tout)}>
                  {tout ? `Afficher les ${VISIBLES} premiers réseaux` : `Afficher les ${lignes.length} réseaux`}
                </button>
              )}
              <p className="cap">{RESEAU_DU_LOGEMENT}</p>
            </>
          )}

          <ul className="legende-ars" aria-label="Classes de l’indicateur de l’ARS">
            {LETTRES_ARS.map((l) => (
              <li key={l}>
                <span className={`la-barre tuile-${l}`} aria-hidden="true" />
                <span>
                  <b>{l}</b> {LIBELLES_ARS[l]}*
                </span>
              </li>
            ))}
          </ul>
          <p className="cap">{NOTE_LIBELLES_ARS}</p>
          <p className="cf-liens">
            {seul && <LienSynthese code={seul.code} annee={annee} />}
            <Link to="/methode#classe-ars">Comment la classe est calculée</Link>
          </p>
        </>
      )}
    </section>
  )
}

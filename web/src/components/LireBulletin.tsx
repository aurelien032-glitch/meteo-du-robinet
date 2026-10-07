import { Link } from 'react-router-dom'
import { fmt } from '../lib/data'
import { instrument, TEXTES_FAMILLES, valeursReseau } from '../lib/instruments'
import { FAMILLES_SITU, SEUIL_BACT, SEUILS_NITRATES } from '../lib/situations'
import Jauge from './Jauge'
import Paliers from './Paliers'
import Voyant from './Voyant'

const SANS_VALEUR = valeursReseau(undefined, {})
/** Bornes des réserves, lues dans lib/situations.ts (un seuil ne s'écrit qu'une fois) : nitrates de 25 à 50 mg/L, 5 % au plus. */
const RESERVE_NITRATES = `${fmt.int(SEUILS_NITRATES[0])} à ${fmt.int(SEUILS_NITRATES[SEUILS_NITRATES.length - 1])} mg/L`
const RESERVE_BACT = fmt.pctBorne(1 - SEUIL_BACT)
/** Filet des pastilles les plus claires (gris --d0), comme celui des légendes de cartes. */
const FILET = { boxShadow: 'inset 0 0 0 1px var(--border-fort)' }

/**
 * « Lire un bulletin » (maquette du 23/09) : ce que dit chaque voyant, puis toute la palette du site, et seulement
 * elle (règle « juger et alerter en couleur », auteur, 24/09 ; audit des couleurs du 27/09) — couleurs de jugement et
 * d'alerte, gris neutre de l'absence de consigne, hachures de l'absence de donnée, bleu → jaune → rouge des agrégats de la qualité
 * de l'eau (04/10), ocre du contexte —, enfin l'échelle de chaque famille, graduée aux seuils de son
 * bilan officiel. Page Méthode, puis accueil.
 */
export default function LireBulletin({ replie = false }: { replie?: boolean }) {
  // Dans une section repliée de la Méthode (refonte du 2026-10-05), le titre est celui de la section ; l'ancre
  // #lire-bulletin reste sur le bloc.
  const Bloc = replie ? 'div' : 'section'
  return (
    <Bloc className={replie ? 'lire-bulletin' : 'card lire-bulletin'} {...(replie ? { id: 'lire-bulletin' } : { 'aria-labelledby': 'lire-bulletin' })}>
      {!replie && <h2 id="lire-bulletin">Lire un bulletin</h2>}
      <p>
        Chaque famille de paramètres est évaluée selon la méthode de son bilan officiel, sur une échelle qui lui est propre. Le site emploie
        partout la palette de ses cartes, du bleu au rouge en passant par le jaune et l’orange, pour le jugement d’un réseau, sa note et les
        alertes (avis de l’ARS, sécheresse). Le bleu clair signale un réseau conforme, l’orange un réseau non conforme et le rouge une
        restriction ; le jaune marque le degré le moins grave. Les chiffres agrégés de la qualité de l’eau suivent la même palette et les
        données de contexte sont présentées en gris ou en ocre. Ces couleurs restent distinctes pour les personnes daltoniennes. Les sigles et les termes employés sur le site sont définis dans le <Link to="/methode#lexique">lexique</Link>.
      </p>
      <ul className="grammaire">
        <li className="tone-good">
          <Voyant ton="good" taille={24} />
          <strong>Conforme</strong>
          <span>Aucune limite de qualité n’est dépassée au sens des bilans officiels. Une réserve est mentionnée lorsqu’une classe intermédiaire figure dans le détail.</span>
        </li>
        <li className="tone-warn">
          <Voyant ton="warn" taille={24} />
          <strong>Non conforme</strong>
          <span>Le bilan de la famille retient au moins un dépassement.</span>
        </li>
        <li className="tone-bad">
          <Voyant ton="bad" taille={24} />
          <strong>Restriction ou consigne</strong>
          <span>
            La consommation de l’eau fait l’objet d’une restriction ou d’une consigne d’ébullition, au titre de la classe de restriction du bilan ou
            d’un avis de l’ARS. Les deux mesures portent le même octogone.
          </span>
        </li>
        <li className="tone-na">
          <Voyant ton={null} taille={24} />
          <strong>Non analysée</strong>
          <span>Aucune analyse de cette famille n’a été réalisée sur ce réseau dans l’année.</span>
        </li>
      </ul>
      {/* Règle « juger et alerter en couleur » (auteur, 24/09) : une seule palette pour tout le site, expliquée ici. */}
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span style={{ background: 'var(--good-line)', ...FILET }} />
          <span style={{ background: 'var(--warn-line)', ...FILET }} />
          <span style={{ background: 'var(--warn)', ...FILET }} />
          <span style={{ background: 'var(--bad)', ...FILET }} />
          <span style={{ background: 'var(--bad-fort)', ...FILET }} />
        </span>
        <span>
          Les notes, les cartes et les graphiques emploient la même palette. La note A est en bleu clair, la note B en jaune, la note C en orange et
          la note D en rouge. Une commune prend la couleur du réseau le plus défavorable qui la dessert. Sur
          les cartes des nitrates et de la bactériologie, les classes avec réserve (nitrates de {RESERVE_NITRATES}, {RESERVE_BACT} au plus de
          prélèvements non conformes) ont le bleu de la classe conforme ; la légende les réunit sous la mention « conforme, réserves comprises ».
          Pour les pesticides, le jaune correspond aux dépassements cumulés sur 30 jours au plus et l’orange aux dépassements de plus de 30 jours.
          Un avis de l’ARS prend la couleur de sa consigne, orange pour une eau déconseillée aux publics sensibles, rouge pour une consigne
          d’ébullition et rouge très sombre (mauve en thème sombre) pour une restriction de consommation. Une restriction sécheresse prend
          celle de son niveau officiel, bleu clair en l’absence de restriction, jaune en vigilance, orange en alerte, rouge en alerte renforcée et
          rouge très sombre (mauve en thème sombre) en crise. Une restriction sécheresse limite certains usages de l’eau (arrosage, lavage…) sans
          en restreindre la consommation.
        </span>
      </p>
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span style={{ background: 'var(--d0)', ...FILET }} />
        </span>
        <span>
          Le gris neutre indique qu’aucune consigne de l’ARS n’a été relevée. Il correspond à la mention « aucun avis » sur les cartes des avis
          et à la mention « ni restriction ni consigne » sur les cartes des restrictions de consommation. Pour l’année en cours, un avis de l’ARS
          que les prélèvements suivants du réseau ne mentionnent plus est également présenté en gris, car les données ne permettent pas de savoir
          s’il a été levé.
        </span>
      </p>
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span className="swatch swatch-nd" />
        </span>
        <span>
          Les hachures signalent l’absence de donnée. Sur les cartes, elles désignent les zones sans prélèvement ou sans donnée. Elles désignent
          aussi, avec la mention « pas d’information », les départements où aucune conclusion de l’ARS de l’année n’évoque de consigne, ainsi que
          leurs communes ; l’absence d’avis ou de restriction n’y permet aucune conclusion. Dans les graphiques, les barres estompées et
          hachurées correspondent au millésime en cours, encore incomplet.
        </span>
      </p>
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span style={{ background: 'var(--good-line)', ...FILET }} />
          <span style={{ background: 'var(--warn-line)', ...FILET }} />
          <span style={{ background: 'var(--warn)', ...FILET }} />
          <span style={{ background: 'var(--bad)', ...FILET }} />
        </span>
        <span>
          Les chiffres agrégés de la qualité de l’eau (France, département, service d’eau) sont des statistiques descriptives et n’expriment
          aucun jugement de conformité. Les cartes des parts de réseaux notés C ou D, ou non conformes, reprennent les couleurs des notes,
          du bleu clair sous 10 % au jaune de 10 à 25 %, à l’orange de 25 à 50 % et au rouge à partir de 50 %. Les graphiques sont en barres
          orangées. Le voyant placé à côté de certains de ces chiffres rappelle l’état qu’ils
          dénombrent.
        </span>
      </p>
      <p className="grammaire-note">
        <span className="nuancier" aria-hidden="true">
          <span style={{ background: 'var(--m5)' }} />
          <span style={{ background: 'var(--m1)' }} />
          <span style={{ background: 'var(--d0)', ...FILET }} />
          <span style={{ background: 'var(--w1)' }} />
          <span style={{ background: 'var(--w3)' }} />
        </span>
        <span>
          Les données de contexte (niveau des nappes, évolution des prélèvements d’eau potable) sont présentées sans jugement de conformité. Une
          échelle divergente les répartit de part et d’autre d’un gris central, en ardoise d’un côté et en ocre de l’autre. L’ocre correspond aux
          nappes sous leur niveau habituel et aux prélèvements en hausse. Les parts de piézomètres au niveau bas et de nappes sous la normale
          suivent une rampe qui va du gris à l’ocre.
        </span>
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
    </Bloc>
  )
}

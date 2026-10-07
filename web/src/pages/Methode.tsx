import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import LireBulletin from '../components/LireBulletin'
import { Goutte } from '../components/MonEau'
import Section from '../components/Section'
import TableauArrete from '../components/TableauArrete'
import { LETTRES_ARS, RESEAU_DU_LOGEMENT } from '../lib/bilan'
import { EFFECTIF_MIN } from '../lib/classement'
import { fmt } from '../lib/data'
import Chargement from '../components/Chargement'
import { useJson } from '../lib/hooks'
import { TITRES_NOTE } from '../lib/monEau'
import { ANALYSES_BACT_MIN, CLASSES_ARS, GRILLE_BACT, MAX_GERMES, SEUIL_JOURS_PESTICIDES, type LettreArs } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import { dernierComplet, type AvisNationalFile, type MetaFile } from '../lib/types'
import { dateLongue } from '../lib/avis'
import { HISTORIQUE_METHODE, VERSION_METHODE } from '../lib/versionMethode'

/** Ce que recouvre chaque note, en une phrase (« L'essentiel ») ; le calcul complet est dans la règle #classe-ars. */
const SENS_NOTE: Record<LettreArs, string> = {
  A: 'Aucun dépassement des limites de qualité retenu par la note dans l’année.',
  B: `Dépassements limités, ${SEUIL_JOURS_PESTICIDES} jours cumulés au plus dans l’année, ou rares contaminations bactériologiques.`,
  C: `Dépassements de plus de ${SEUIL_JOURS_PESTICIDES} jours, contamination bactériologique marquée, ou eau déconseillée par l’ARS aux publics sensibles.`,
  D: 'Restriction de consommation prononcée par l’ARS, ou contaminations bactériologiques fréquentes.',
}

/**
 * Lignes de la grille bactériologique de l'ARS, de la plus petite à la plus grande série de prélèvements, écrites à
 * partir de GRILLE_BACT (lib/situations.ts, recopiée du pipeline) : un seuil ne s'écrit qu'une fois.
 */
const LIGNES_GRILLE = [...GRILLE_BACT].reverse().map(([min, seuilD, seuilA], i, t) => {
  const suivant = t[i + 1]?.[0]
  const effectif = min === 0 ? `moins de ${suivant}` : suivant ? `${min} à ${suivant - 1}` : `${min} et plus`
  return {
    effectif,
    a: `≥ ${seuilA} %, max. < ${MAX_GERMES}`,
    b: seuilA > seuilD ? `${seuilD} à ${seuilA} %, max. < ${MAX_GERMES}` : '–',
    c: `≥ ${seuilD} %, max. ≥ ${MAX_GERMES}`,
    d: `< ${seuilD} %`,
  }
})

/** Un bloc de « L'essentiel » : une notion, quelques phrases, le renvoi vers sa règle détaillée. */
function Essentiel({ titre, lien, children }: { titre: string; lien: { vers: string; texte: string }; children: ReactNode }) {
  return (
    <article className="essentiel-bloc">
      <h3>{titre}</h3>
      {children}
      <p className="essentiel-lien">
        <Link to={lien.vers}>{lien.texte}</Link>
      </p>
    </article>
  )
}

/** Une règle détaillée : un titre, puis des paragraphes courts. L'ancre (#familles, #avis…) reste celle des liens du site. */
function Regle({ id, titre, children }: { id?: string; titre: string; children: ReactNode }) {
  return (
    <div className="regle" id={id}>
      <h3>{titre}</h3>
      {children}
    </div>
  )
}

/**
 * Méthode (refonte du 2026-10-05, « lecture méthode inintelligible pour un usager ») : « L'essentiel » d'abord, six notions
 * écrites pour l'habitant (d'où viennent les résultats, le réseau, la note, limite et référence, avis de l'ARS, ce que le
 * site n'indique pas) ; puis les règles détaillées, repliées par sujet, sans rien retirer. Les ancres des liens du site
 * (#familles, #classe-ars, #avis, #lexique…) ouvrent la section qui les contient (`aussi` de Section).
 */
export default function Methode() {
  usePageTitle('Méthode', "Sources des données, règles de calcul et limites de lecture du site Météo du robinet.")
  const meta = useJson<MetaFile>('meta.json').data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  // Départements sans information du dernier millésime complet (pipeline, avis.sans_information), la liste restant sur /avis.
  const an = dernierComplet(meta)
  const muets = an != null ? avis?.sans_information?.[String(an)] : undefined
  // La date de construction (meta.json) passait de « … » à sa valeur et ajoutait une ligne sur téléphone, décalant toute la
  // page (audit UI UX Pro Max du 2026-10-06) : la page attend ce petit fichier.
  if (!meta) return <Chargement reserve />
  return (
    <div className="prose page methode">
      <p className="eyebrow">Méthode</p>
      <Crumbs items={[{ label: 'Méthode' }]} />
      <h1>Méthode</h1>
      <p className="lead">
        Le site présente les résultats du contrôle sanitaire de l’eau du robinet et les indicateurs des services d’eau, tels que les publient
        les administrations. Il n’est pas un site officiel ; pour toute consigne sanitaire, la mairie et l’agence régionale de santé font foi.
      </p>
      <p className="methode-maj">
        Dernière construction des données le{' '}
        {/* « 2026-09-24 00:19 » s'affichait tel quel : date et heure à la française (vérification du 24/09). */}
        {meta?.construit_le ? `${fmt.date(meta.construit_le.slice(0, 10))} à ${meta.construit_le.slice(11, 16).replace(':', ' h ')}` : '…'} ; millésimes{' '}
        {meta?.annees.join(', ') ?? '…'}.
      </p>
      {/* Version datée de la méthode (auteur, 2026-10-07, plutôt qu'un bandeau « bêta ») : la date du dernier changement
          d'une règle, et son historique (lib/versionMethode.ts). */}
      <p className="methode-maj">
        Méthode de calcul, version du {dateLongue(VERSION_METHODE)} · <a href="#historique">Historique des changements</a>
      </p>

      <section className="card essentiel" aria-labelledby="essentiel">
        <h2 id="essentiel">L’essentiel</h2>
        <div className="essentiel-grille">
          <Essentiel titre="Les résultats publiés" lien={{ vers: '/methode#sources', texte: 'Sources des données' }}>
            <p>
              Les agences régionales de santé (ARS) font prélever et analyser l’eau du robinet tout au long de l’année. Cette surveillance
              réglementaire s’appelle le contrôle sanitaire. Le ministère chargé de la Santé en publie chaque résultat en données ouvertes ; le
              site les reprend tels que publiés.
            </p>
          </Essentiel>
          <Essentiel titre="Le réseau de distribution" lien={{ vers: '/methode#unite', texte: 'Le réseau, unité de mesure' }}>
            <p>
              Un réseau de distribution est un ensemble de canalisations qui délivre une eau de même qualité. Une commune est desservie par un ou
              plusieurs réseaux, et un réseau peut desservir plusieurs communes. Le contrôle sanitaire juge l’eau réseau par réseau, et le site
              procède de même.
            </p>
            <p>{RESEAU_DU_LOGEMENT}</p>
          </Essentiel>
          <Essentiel titre="La note de A à D" lien={{ vers: '/methode#classe-ars', texte: 'Calcul détaillé de la note' }}>
            <p>
              Depuis 2023, l’ARS joint chaque année à la facture d’eau une synthèse qui attribue à l’eau du réseau une note de A à D. Le site
              calcule cette note pour chaque réseau selon les mêmes principes. La synthèse de l’ARS fait foi.
            </p>
            <ul className="essentiel-notes">
              {LETTRES_ARS.map((l) => (
                <li key={l}>
                  <Goutte lettre={l} petite />
                  <span>
                    <b>{TITRES_NOTE[l]}.</b> {SENS_NOTE[l]}
                  </span>
                </li>
              ))}
            </ul>
          </Essentiel>
          <Essentiel titre="Limite et référence de qualité" lien={{ vers: '/methode#arrete', texte: 'Les seuils de l’arrêté' }}>
            <p>
              L’arrêté du 11 janvier 2007 fixe des limites de qualité. Un résultat supérieur à une limite rend l’eau non conforme ; il ne la rend
              pas pour autant impropre à la consommation, et seule l’ARS peut en restreindre l’usage.
            </p>
            <p>
              Une référence de qualité sert à vérifier le bon fonctionnement des installations ; son dépassement n’est pas une non-conformité.
              Certaines substances n’ont aucun seuil réglementaire.
            </p>
          </Essentiel>
          <Essentiel titre="Les avis de l’ARS" lien={{ vers: '/methode#avis', texte: 'Relevé des avis' }}>
            <p>
              Lorsque la qualité de l’eau le justifie, l’ARS peut en restreindre la consommation, demander de la faire bouillir ou la déconseiller
              aux nourrissons et aux femmes enceintes. Le site relève ces avis dans les conclusions des prélèvements et en donne la date.
            </p>
            <p>La levée d’un avis n’étant pas publiée, le site n’indique jamais qu’un avis est en vigueur. La mairie et l’ARS font foi.</p>
          </Essentiel>
          <Essentiel titre="Ce que le site n’indique pas" lien={{ vers: '/methode#limites', texte: 'Limites des données' }}>
            <p>
              Le site ne se prononce pas sur la consommation de l’eau ; cette appréciation relève de l’ARS. Il n’avance aucune cause de
              pollution. Il n’estime pas le nombre d’habitants concernés, la population desservie par chaque réseau n’étant pas publiée. Il ne
              classe ni les communes ni les départements.
            </p>
          </Essentiel>
        </div>
      </section>

      <h2 id="regles" className="methode-regles-titre">
        Règles détaillées
      </h2>
      <p className="methode-regles-intro">Les sections suivantes précisent les définitions, les couleurs, chacune des règles de calcul du site et ses sources.</p>

      {/* Lexique (choix de l'auteur, 24/09) : les sigles et les mots du site n'étaient définis nulle part. */}
      <Section id="lexique" titre="Lexique" resume="ARS, réseau, note, limite et référence de qualité, PFAS…" aussi={['exploitant']}>
        <dl className="lexique">
          <dt>ARS</dt>
          <dd>Agence régionale de santé. Elle organise le contrôle sanitaire de l’eau du robinet et prescrit, le cas échéant, une restriction ou une consigne.</dd>
          <dt>Réseau de distribution</dt>
          <dd>
            Ensemble de canalisations qui délivre une eau de même qualité, sous un même exploitant (« unité de distribution » dans le contrôle sanitaire). Il
            dessert une ou plusieurs communes, ou une partie de commune. Les bilans officiels et ce site évaluent la qualité de l’eau à l’échelle du réseau.
          </dd>
          <dt>Note</dt>
          <dd>
            Lettre de A à D de l’indicateur global de qualité de l’ARS, calculée par le site pour chaque réseau. La synthèse annuelle de l’ARS, jointe à la
            facture d’eau, fait foi.
          </dd>
          <dt>Famille de paramètres</dt>
          <dd>
            Groupe de substances évaluées ensemble, selon la méthode d’un même bilan officiel : pesticides et métabolites, nitrates, PFAS, bactériologie,
            métaux et minéraux, autres limites de qualité.
          </dd>
          <dt>Paramètre</dt>
          <dd>Substance ou indicateur analysé : nitrates, bactérie E. coli, plomb, turbidité…</dd>
          <dt>Limite de qualité</dt>
          <dd>
            Valeur réglementaire. Son dépassement rend l’eau non conforme sans la rendre pour autant impropre à la consommation ; cette décision
            relève de la seule ARS.
          </dd>
          <dt>Référence de qualité</dt>
          <dd>Valeur indicative, sans caractère obligatoire. Son dépassement appelle une vigilance et ne constitue pas une non-conformité.</dd>
          <dt>Valeur indicative</dt>
          <dd>
            Repère sans valeur de limite, cité par les autorités sanitaires pour une substance qui n’a pas de limite de qualité (0,9 µg/L pour un
            métabolite de pesticide non pertinent).
          </dd>
          <dt>Métabolite</dt>
          <dd>
            Substance issue de la dégradation d’un pesticide. L’Anses le déclare pertinent ou non pertinent ; un métabolite non pertinent n’est plus
            soumis à la limite de qualité des pesticides.
          </dd>
          <dt>Restriction ou consigne</dt>
          <dd>
            Mesure prescrite par l’ARS : interdiction de boire l’eau, obligation de la faire bouillir, ou avis la déconseillant aux nourrissons
            et aux femmes enceintes.
          </dd>
          <dt>Restriction sécheresse</dt>
          <dd>Arrêté préfectoral qui limite certains usages de l’eau (arrosage, lavage, remplissage…) sans en restreindre la consommation.</dd>
          <dt>Millésime</dt>
          <dd>Année des données : celle des prélèvements du contrôle sanitaire, ou celle des déclarations des services d’eau.</dd>
          <dt>Service d’eau, SISPEA</dt>
          <dd>
            Le service d’eau produit, transporte ou distribue l’eau pour une collectivité. SISPEA est l’observatoire national des services d’eau et
            d’assainissement (Office français de la biodiversité), qui publie leurs indicateurs : prix, rendement, renouvellement…
          </dd>
          <dt>Régie, gestion déléguée</dt>
          <dd>En régie, la collectivité gère elle-même son service ; en gestion déléguée, elle le confie par contrat à une entreprise ou à une société publique locale.</dd>
          {/* Relecture du 25/09 : « Exploitant », « Distribution » et « Unité de gestion » se côtoyaient sur les fiches sans être définis. */}
          <dt id="exploitant">Exploitant, distributeur, unité de gestion</dt>
          <dd>
            Ces trois termes proviennent de deux sources distinctes. L’exploitant est celui que le service d’eau déclare à SISPEA : en gestion
            déléguée, l’entreprise ou la société publique locale qui gère le service ; en régie, la collectivité elle-même, dont le nom est
            souvent absent de la déclaration. Le distributeur est l’entreprise ou la collectivité que l’ARS enregistre pour chaque réseau dans
            le contrôle sanitaire ; l’unité de gestion est l’unité d’exploitation à laquelle l’ARS rattache ce réseau. Chaque source transcrit
            les noms selon ses propres conventions (sigle ou nom complet, groupe ou société dédiée au contrat) ; deux noms différents peuvent
            donc désigner le même exploitant.
          </dd>
          <dt>PFAS</dt>
          <dd>Substances per- et polyfluoroalkylées, dites « polluants éternels » ; la limite de qualité porte sur la somme de 20 d’entre elles.</dd>
          <dt>Nappe, piézomètre</dt>
          <dd>Une nappe est une réserve d’eau souterraine ; un piézomètre est un forage qui mesure son niveau.</dd>
          <dt>ZRE, BNPE</dt>
          <dd>
            Zone de répartition des eaux : territoire où la ressource manque de façon chronique face aux besoins. BNPE : banque nationale des prélèvements
            d’eau, qui recense les volumes prélevés, ouvrage par ouvrage.
          </dd>
        </dl>
      </Section>

      <Section id="couleurs" titre="Couleurs et symboles" resume="Notes, voyants, palettes des cartes, hachures" aussi={['lire-bulletin']}>
        <p>
          La goutte qui porte la note d’un réseau prend la couleur de sa lettre, bleu clair pour la note A, jaune pour la note B, orange pour la
          note C et rouge pour la note D. Ce sont les couleurs des cartes du site, employées partout où il juge ou alerte. Les voyants, les palettes et les hachures sont décrits ci-dessous.
        </p>
        <LireBulletin replie />
      </Section>

      <Section
        id="regles-note"
        titre="La note et les familles de paramètres"
        resume="Méthode par famille, calcul de la note, résultats écartés"
        aussi={[
          'familles',
          'classe-ars',
          'grille-bacteriologique',
          'confirmation-pfas',
          'hors-jugement',
          'comparaison-ars',
          'duree',
          'limite-reference',
          'pesticides',
          'directive-2020-2184',
          'non-detectes',
          'annee-en-cours',
        ]}
      >
        <Regle id="familles" titre="Six familles de paramètres">
          <p>Chaque famille est évaluée selon la méthode de son bilan officiel.</p>
          <ul>
            <li>
              <b>Pesticides.</b> Quatre classes : conforme ; dépassements pendant 30 jours cumulés au plus ; plus de 30 jours ; restriction de
              consommation. La valeur sanitaire maximale qui définit cette dernière classe n’étant pas publiée, la restriction effectivement
              prononcée en tient lieu.
            </li>
            <li>
              <b>Nitrates.</b> Tranche de la concentration maximale de l’année, avec des paliers à 25, 40 et 50 mg/L.
            </li>
            <li>
              <b>Bactériologie.</b> Taux de prélèvements conformes du réseau. La qualité est jugée bonne à partir de 95 % de prélèvements
              conformes, soit 5 % de prélèvements non conformes au plus. Le site exprime ces classes en part de prélèvements non conformes.
              La note suit la grille propre à l’indicateur de l’ARS, décrite plus bas.
            </li>
            <li>
              <b>PFAS.</b> Conformité à la limite de qualité. L’ARS ne conclut à la non-conformité qu’après confirmation sur deux saisons ; le site
              emploie donc l’expression « dépassement constaté ». Un dépassement isolé, que l’année ne confirme pas, n’entre pas dans la note.
            </li>
            <li>
              <b>Métaux et minéraux.</b> Conformité à la limite de qualité.
            </li>
            <li>
              <b>Autres limites de qualité.</b> Les autres paramètres que l’arrêté du 11 janvier 2007 soumet à une limite de qualité
              (sous-produits de la désinfection, solvants chlorés, benzène, cyanures, turbidité au point de mise en distribution, nitrites, somme
              des nitrates et des nitrites), jugés en conformité à leur limite. La classe des nitrates ne portant que sur leur concentration
              maximale, les nitrites sont jugés dans cette famille.
            </li>
          </ul>
          <p>
            L’indicateur global de l’ARS retient l’ensemble de ces limites, à l’exception des résultats présentés plus bas parmi les résultats
            hors du jugement ; le site procède de même.
          </p>
        </Regle>
        <Regle id="classe-ars" titre="La note A, B, C ou D">
          <p>
            Depuis 2023, la synthèse annuelle de l’ARS jointe à la facture d’eau (infofacture) porte un indicateur global de qualité en quatre
            classes.
          </p>
          <ul>
            {LETTRES_ARS.map((l) => (
              <li key={l}>
                <b>{l}.</b> {CLASSES_ARS[l]}.
              </li>
            ))}
          </ul>
          <p>
            Cet indicateur est défini par la note d’information DGS/EA4 du 19 juillet 2019. Il correspond au classement le plus défavorable obtenu
            pour l’ensemble des paramètres contrôlés. La classe B y correspond à un dépassement ponctuel sans risque pour la santé, la classe C à
            des dépassements récurrents inférieurs aux seuils sanitaires, la classe D à des dépassements des seuils sanitaires ayant donné lieu à
            des restrictions d’usage. Le détail du calcul pour chaque paramètre n’est pas publié en données ouvertes.
          </p>
          <p>
            Sur ses pages, le site désigne la lettre de cet indicateur comme la note de l’eau. Il applique ces principes à chaque famille. La note
            A correspond à une famille conforme, réserves comprises ; la note B à des dépassements cumulés sur 30 jours au plus dans l’année ; la
            note C à plus de 30 jours, ou à une eau déconseillée par l’ARS aux publics sensibles pour cette cause ; la note D à une restriction de
            consommation ou à une consigne d’ébullition. La bactériologie et les PFAS suivent les règles particulières décrites ci-dessous. La
            note du réseau est celle de sa famille la plus défavorable.
          </p>
          <p>
            Lorsque les résultats de l’année sont insuffisants, l’ARS peut retenir ceux des années antérieures, dans la limite de cinq années. Le
            site donne de même à une famille sans analyse dans l’année la note de sa dernière année analysée, cinq ans au plus, sauf pour l’année
            en cours, dont les résultats ne sont pas encore complets ; le bulletin le précise.
          </p>
          <p>
            La note est calculée par le site ; la synthèse de l’ARS fait foi. Celle-ci peut porter une appréciation locale, par exemple sur un
            dépassement constaté en station de traitement sans effet en distribution.
          </p>
        </Regle>
        <Regle id="grille-bacteriologique" titre="Note de la bactériologie">
          <p>
            La note bactériologique suit la grille de l’indicateur de l’ARS, publiée par l’ARS Provence-Alpes-Côte d’Azur. Elle porte sur les{' '}
            {ANALYSES_BACT_MIN} derniers prélèvements au moins. Lorsque l’année en compte moins, les années antérieures s’y ajoutent, cinq ans au plus,
            comme l’indiquent les synthèses (« années prises en compte ») ; les données du site commencent en 2023. La grille croise le taux de
            prélèvements conformes aux limites de qualité (Escherichia coli et entérocoques) et la valeur maximale mesurée pour ces deux germes, en
            nombre pour 100 mL. Ses seuils dépendent du nombre de prélèvements.
          </p>
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Grille bactériologique de l’indicateur de l’ARS</caption>
              <thead>
                <tr>
                  <th>Prélèvements</th>
                  <th>Note A</th>
                  <th>Note B</th>
                  <th>Note C</th>
                  <th>Note D</th>
                </tr>
              </thead>
              <tbody>
                {LIGNES_GRILLE.map((g) => (
                  <tr key={g.effectif}>
                    <td>{g.effectif}</td>
                    <td>{g.a}</td>
                    <td>{g.b}</td>
                    <td>{g.c}</td>
                    <td>{g.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cap">
            Pourcentage de prélèvements conformes ; max. : valeur maximale d’Escherichia coli ou d’entérocoques, en nombre pour 100 mL.
          </p>
          <p>
            Une consigne d’ébullition ou une restriction prononcée pour une contamination bactérienne ne vaut pas la note D d’office : les
            synthèses de l’ARS notent ces réseaux selon la même grille, et plusieurs d’entre elles les classent en C. La consigne reste signalée
            parmi les avis de l’ARS.
          </p>
        </Regle>
        <Regle id="confirmation-pfas" titre="Dépassement de PFAS et confirmation">
          <p>
            Selon l’instruction de la direction générale de la santé du 19 février 2025, un dépassement de la limite de la somme de 20 PFAS est
            confirmé par une série d’analyses réparties sur deux saisons. Le site retient dans la note un dépassement observé au moins deux jours
            dans l’année ; un dépassement isolé reste publié et signalé au bulletin, sans entrer dans la note. Les synthèses de l’ARS examinées
            procèdent de même.
          </p>
        </Regle>
        <Regle id="hors-jugement" titre="Résultats publiés hors du jugement">
          <p>
            Comme l’indicateur de l’ARS, le jugement d’un réseau écarte trois catégories de résultats. Ces résultats restent publiés dans le détail
            des analyses, avec une remarque.
          </p>
          <ul>
            <li>
              <b>Canalisations intérieures.</b> Le plomb, le cuivre et le nickel sont mesurés au robinet et dépendent des installations privées,
              en amont desquelles s’applique la limite du plomb.
            </li>
            <li>
              <b>Matériaux des canalisations publiques et réactifs de traitement.</b> Le chlorure de vinyle, les hydrocarbures aromatiques
              polycycliques et le benzo(a)pyrène, l’acrylamide et l’épichlorhydrine sont écartés du calcul de l’indicateur par la direction
              générale de la santé. Les synthèses de l’ARS classent ainsi en A des réseaux dont le seul dépassement de l’année porte sur le
              chlorure de vinyle. Lorsque l’un de ces paramètres dépasse sa limite et que l’ARS prononce pour cette raison une restriction de
              consommation, le réseau est néanmoins classé en D, comme le fait l’ARS.
            </li>
            <li>
              <b>Métabolites de pesticides non pertinents.</b> Un métabolite déclaré non pertinent par l’Anses perd sa limite de qualité de
              0,1 µg/L au profit d’une valeur indicative de 0,9 µg/L. Le site, comme l’ARS, ne le retient plus dès l’année de l’avis. D’après le
              tableau de l’Anses de juillet 2025, c’est le cas du chlorothalonil R471811 (avis du 29 avril 2024), de l’ESA-métolachlore
              (30 septembre 2022), du diméthénamide ESA (26 janvier 2022) et de l’AMPA du glyphosate (5 juin 2025).
            </li>
          </ul>
          <p>
            En 2024, les laboratoires incluaient encore un tel métabolite dans le total des pesticides analysés, dont la limite est de 0,5 µg/L ;
            ils l’en ont retiré en 2025. Le site juge donc ce total sans le métabolite lorsqu’il l’inclut, ce que montre la comparaison du total
            avec la somme des substances mesurées dans le même prélèvement. Sans cette correction, 274 réseaux auraient été jugés non conformes en
            2024 par ce seul total.
          </p>
          <p>
            Les synthèses de l’ARS Bourgogne-Franche-Comté appliquent la même règle (Dijon, réseau Est dijonnais ; Augy, dans l’Yonne : note A) ;
            celles de l’ARS Centre-Val de Loire retiennent encore le métabolite en 2024 (Aunay-sous-Crécy : note B). La valeur publiée reste celle
            du laboratoire.
          </p>
        </Regle>
        <Regle id="comparaison-ars" titre="Comparaison aux synthèses de l’ARS">
          <p>
            Le 5 octobre 2026, la note 2025 du site a été comparée à celle de 198 synthèses annuelles de l’ARS, de toutes les régions. Sur 72
            réseaux tirés au hasard, la note est identique pour 63 d’entre eux, soit 88 %. Les notes des pesticides et des nitrates coïncident dans
            tous les cas comparés.
          </p>
          <p>
            Les écarts tiennent à des pratiques propres à certaines agences (classement en C de contaminations que la grille place en D,
            appréciation d’un dépassement d’arsenic ou de turbidité), à des prélèvements antérieurs à 2023, que les synthèses peuvent retenir et
            que le site ne détient pas, et à des résultats que les données ouvertes ne portent pas encore. La synthèse de l’ARS fait foi.
          </p>
        </Regle>
        <Regle id="duree" titre="Durée d’un dépassement">
          <p>
            Elle court du premier résultat au-dessus de la limite jusqu’au premier résultat conforme suivant sur le même réseau, ou jusqu’au
            31 décembre en l’absence d’analyse ultérieure dans l’année. Un réseau analysé une seule fois par an sort donc rapidement de la classe
            « 30 jours au plus ».
          </p>
        </Regle>
        <Regle id="limite-reference" titre="Limite de qualité et référence de qualité">
          <p>
            La limite est un seuil sanitaire réglementaire, dont le dépassement rend l’eau non conforme. La référence est une valeur indicative de
            bon fonctionnement. Les dépassements dénombrés par le site portent uniquement sur les limites ; les dépassements de références sont
            comptés séparément. Le tableau des <Link to="/methode#arrete">seuils de l’arrêté</Link> donne le type de chaque seuil.
          </p>
        </Regle>
        <Regle id="pesticides" titre="Paramètres comptés comme pesticides">
          <p>
            Sont comptés comme pesticides les paramètres dont la limite de qualité est de 0,1 ou 0,03 µg/L, à l’exception des PFAS et de la somme
            des hydrocarbures aromatiques polycycliques, ainsi que les sommes « total des pesticides » et les familles atrazine et terbuthylazine.
          </p>
          <p>
            La requalification réglementaire d’un métabolite modifie donc le comptage sans que la qualité de l’eau ait changé. Un métabolite déclaré
            non pertinent ne compte plus dès l’année de l’avis de l’Anses.
          </p>
        </Regle>
        <Regle id="directive-2020-2184" titre="Limites de la directive européenne 2020/2184">
          <p>
            Les limites de qualité introduites par la directive européenne 2020/2184 (somme de 20 PFAS, chlorates, chlorites, acides
            haloacétiques, bisphénol A, uranium), ainsi que la limite du chrome VI propre à la réglementation française, figurent dans l’arrêté du
            11 janvier 2007 modifié par l’arrêté du 30 décembre 2022. Elles s’appliquent depuis le 1er janvier 2023 (note d’information de la
            direction générale de la santé du 14 avril 2023) ; leur recherche systématique dans le contrôle sanitaire est obligatoire à partir du
            1er janvier 2026. Le total des microcystines, soumis à une limite de qualité avant la directive, la conserve pour les eaux d’origine
            superficielle.
          </p>
          <p>
            Un résultat supérieur à l’une de ces limites est donc compté comme une non-conformité dès 2023, première année des données du site.
            Avant 2026, ces paramètres n’étaient recherchés que sur une partie des réseaux ; le nombre de réseaux analysés pour les PFAS est donc
            plus faible les années précédentes.
          </p>
        </Regle>
        <Regle id="non-detectes" titre="Résultats non détectés">
          <p>
            Un résultat non détecté (par exemple « inférieur à 0,005 ») est enregistré à zéro. Les moyennes sont donc des bornes basses. Un résultat
            est dit quantifié lorsqu’il est strictement supérieur à zéro.
          </p>
        </Regle>
        <Regle id="annee-en-cours" titre="Année en cours">
          <p>
            Le millésime de l’année en cours est publié mois par mois et reste partiel jusqu’à la publication de l’année entière. Les fiches des
            communes et des réseaux, la page « La France » et les fiches des départements s’ouvrent sur la dernière année complète ; l’année en
            cours y figure sous « En ce moment ». Les autres pages s’ouvrent sur l’année en cours, et la barre d’année donne accès à chaque
            millésime.
          </p>
          <p>
            Le bilan d’une année en cours porte sur les prélèvements conclus depuis le 1er janvier. Une conformité y est écrite « depuis le
            1er janvier » ; un dépassement reste daté de l’année.
          </p>
        </Regle>
      </Section>

      <Section
        id="regles-avis"
        titre="Les avis de l’ARS"
        resume="Lecture des conclusions, année en cours, départements sans information"
        aussi={['avis', 'avis-annee-en-cours', 'sans-information']}
      >
        <Regle id="avis" titre="Relevé des avis">
          <p>
            Chaque prélèvement porte une conclusion rédigée par l’ARS, en texte libre. Le site classe automatiquement ces conclusions, lues phrase
            par phrase, en trois catégories : restriction de consommation, consigne d’ébullition, eau déconseillée aux publics sensibles
            (nourrissons, femmes enceintes, personnes fragiles).
          </p>
          <p>
            Sont écartés les formulations négatives (« n’entraînant pas de mesure de restriction »), les levées de restriction, les seuils rappelés
            sans prescription (« au-delà de laquelle l’eau ne doit pas être consommée ») et les mesures envisagées mais non prescrites (« pourront
            être demandées si les anomalies persistent »). Une cause que la conclusion écarte elle-même (« pesticides inférieurs aux valeurs
            sanitaires ») n’est pas retenue comme cause de la consigne.
          </p>
          <p>
            Un avis portant sur un réseau est rattaché à toutes les communes qu’il dessert, même s’il ne visait qu’un secteur. Les avis limités à
            un bâtiment, à un point d’usage ou au seul point de prélèvement (plomb, chlorure de vinyle) sont comptés séparément.
          </p>
          <p>
            Ce classement résulte d’une lecture des conclusions et ne constitue pas un registre officiel des restrictions. Pour toute consigne
            sanitaire, la mairie et l’ARS font foi.
          </p>
        </Regle>
        <Regle id="avis-annee-en-cours" titre="Avis de l’année en cours">
          <p>
            Les données du contrôle sanitaire sont publiées chaque mois et s’arrêtent au dernier prélèvement transmis ; l’ARS ne publie pas la
            levée d’une consigne. Le site n’indique donc jamais qu’un avis est en vigueur. Il en donne la période et la date d’arrêt des données,
            puis la situation au dernier prélèvement connu du réseau.
          </p>
          <p>
            Lorsque la conclusion de ce prélèvement reprend l’avis, le site l’indique par la mention « avis repris » ou « au dernier prélèvement
            connu du réseau ». Lorsque des prélèvements plus récents ne le mentionnent plus, l’avis porte la mention « avis absent des
            prélèvements suivants » et s’affiche en gris. Cette absence ne prouve pas la levée de l’avis, car toutes les ARS ne répètent pas une
            consigne dans chaque conclusion. La mairie et l’ARS font foi.
          </p>
        </Regle>
        <Regle id="sans-information" titre="Départements sans information sur les consignes">
          <p>
            Dans certains départements, aucune conclusion de l’année ne mentionne de consigne, que ce soit pour en prescrire une, pour l’écarter
            (« n’entraînant pas de restriction ») ou pour en rappeler la règle. Les conclusions s’y limitent souvent à une formule type (« Eau
            d’alimentation non-conforme aux limites de qualité »). En Isère, plusieurs centaines de prélèvements non conformes depuis 2023 ne
            présentent que trois formulations différentes. L’absence d’avis n’y a donc aucune valeur informative.
          </p>
          <p>
            Le site y indique « pas d’information », et non « aucun avis », et les cartes représentent ces départements et leurs communes par des
            hachures, comme les zones sans donnée. Cette règle s’applique année par année et par délégation de l’ARS, chaque réseau étant rattaché
            au département qui en assure le suivi. Il suffit qu’une conclusion de l’année mentionne une consigne, y compris pour en écarter une,
            pour que le département soit considéré comme renseigné.
            {muets && (
              <>
                {' '}
                En {an}, cette situation concerne {fmt.nb(muets.length, 'département')} (<Link to={`/avis?annee=${an}`}>liste sur la page des avis</Link>).
              </>
            )}
          </p>
          <p>
            Dans ces départements, la classe « restriction » des familles (pesticides, bactériologie, PFAS, métaux) ne peut pas non plus être
            établie, puisqu’elle repose sur les restrictions mentionnées dans les conclusions. La carte des restrictions de consommation y indique
            donc « pas d’information », et non « ni restriction ni consigne », pour les communes où aucune restriction n’a été relevée, ainsi que
            pour le département lui-même lorsqu’aucune restriction n’y a été trouvée.
          </p>
        </Regle>
      </Section>

      <Section id="regles-cartes" titre="Cartes, tableaux et chiffres" resume="Unité de mesure, chiffres d’une commune, tri des départements" aussi={['unite', 'classements']}>
        <Regle id="unite" titre="Le réseau, unité de mesure">
          <p>
            Le contrôle sanitaire porte sur le réseau de distribution (unité de distribution), qui dessert une ou plusieurs communes. Un
            prélèvement peut couvrir plusieurs réseaux, et une commune peut être desservie par plusieurs réseaux. Les chiffres d’une commune
            agrègent tous ses réseaux ; ceux d’un réseau valent pour toutes les communes qu’il dessert.
          </p>
          <p>
            Une analyse au-dessus de la limite sur un réseau ne permet pas de conclure que l’ensemble d’une commune est concerné, et la population
            desservie par chaque réseau n’est pas publiée en données ouvertes. Les cartes et les tableaux comptent donc des réseaux, et non des
            habitants ni des communes. Les bilans du ministère de la Santé et des ARS pondèrent leurs résultats par cette population ; leurs
            pourcentages ne sont donc pas comparables à ceux du site.
          </p>
          <p>
            Deux rubriques comptent néanmoins des communes : les avis de l’ARS, qui visent des communes et leurs habitants, et la page des
            substances sans limite de qualité, qui ne mesure pas une conformité.
          </p>
        </Regle>
        <Regle id="classements" titre="Tri des départements">
          <p>
            Les tableaux des départements sont présentés par ordre alphabétique et peuvent être triés par part. Une part calculée sur quelques
            réseaux n’est pas représentative d’un département. En 2025, la Haute-Loire serait ainsi arrivée en tête d’un tri de la radioactivité
            avec un seul réseau analysé, dont une analyse dépassait une référence de qualité.
          </p>
          <p>
            Un département n’entre dans le tri que si sa part repose sur au moins {EFFECTIF_MIN} réseaux analysés, ou sur l’ensemble de ses réseaux
            (Paris en compte quatre). Pour un paramètre choisi individuellement, le minimum est de {EFFECTIF_MIN} analyses. Les autres départements
            conservent leur part sur la carte, portent la mention « hors tri » et passent en fin de liste lorsque le tableau est trié par part.
          </p>
        </Regle>
      </Section>

      <Section id="hors-grille" titre="Substances sans limite de qualité" resume="Perchlorate, TFA, métabolites non pertinents…">
        <p>
          Environ un paramètre analysé sur trois n’a ni limite ni référence de qualité (perchlorate, TFA, métabolites de pesticides classés non
          pertinents, PFAS pris un par un, acides haloacétiques…). Aucun de leurs résultats ne peut donc être compté comme un dépassement. Une page
          distincte présente, pour chacune de ces substances, l’étendue de sa recherche et la fréquence de sa quantification.
        </p>
        <p>
          Les seuls repères affichés sont les valeurs que les ARS citent elles-mêmes dans leurs conclusions (perchlorate : 4 et 15 µg/L ;
          métabolites sans limite : 0,9 µg/L). Ces valeurs n’ont pas le statut de limites de qualité.
        </p>
      </Section>

      <Section id="arrete" titre="Les seuils de l’arrêté du 11 janvier 2007" resume="Limites, références et valeurs indicatives, paramètre par paramètre">
        <p>
          L’arrêté du 11 janvier 2007 modifié fixe trois sortes de seuils pour l’eau du robinet. Une limite de qualité est un seuil
          réglementaire ; son dépassement rend l’eau non conforme. Une référence de qualité sert à vérifier le bon fonctionnement des
          installations ; son dépassement n’est pas une non-conformité. Une valeur indicative ou une valeur de vigilance guide la surveillance
          sans fixer de limite.
        </p>
        <p>
          Le tableau donne chaque seuil, et signale quand SISE-Eaux, la base du contrôle sanitaire, porte un seuil différent. La page « Tous les
          résultats » de chaque commune indique le type de seuil de chaque paramètre analysé.
        </p>
        <TableauArrete />
      </Section>

      <Section
        id="regles-ressource"
        titre="Ressource, nappes, sécheresse et services d’eau"
        resume="Niveau des nappes, prélèvements, restrictions sécheresse, prix et rendement"
        aussi={['nappes', 'secheresse', 'ressource', 'services']}
      >
        <Regle id="nappes" titre="Niveau des nappes">
          <p>
            Pour chaque piézomètre suivi depuis au moins 15 ans, le niveau moyen du mois est comparé aux niveaux moyens du même mois des années
            précédentes (30 ans au plus). Son rang le place dans l’une des sept classes de l’indicateur piézométrique standardisé du BRGM, de
            « très bas » (parmi les 10 % d’années les plus basses) à « très haut ». Il s’agit d’un calcul par rang, distinct de l’indicateur
            officiel du BRGM ; les classes obtenues sont comparables à celles du bulletin du BRGM, mais pas les valeurs chiffrées.
          </p>
          <p>
            La nappe suivie la plus proche d’une commune correspond au piézomètre le plus proche de son centre, dans un rayon de 40 km ; ce
            piézomètre ne mesure pas nécessairement la nappe qui alimente la commune.
          </p>
        </Regle>
        <Regle id="secheresse" titre="Historique des restrictions sécheresse">
          <p>
            Pour chaque département et chaque jour, le site retient le niveau le plus grave en vigueur sur l’une de ses zones d’alerte. Un jour
            classé en crise ne signifie donc pas que l’ensemble du département est en crise. Les niveaux ne sont renseignés qu’à partir de 2012, et
            les zones spécifiques à l’eau potable n’existent que depuis 2024.
          </p>
        </Regle>
        <Regle id="ressource" titre="Pression sur la ressource">
          <p>
            Les prélèvements ne sont pas rapportés aux volumes autorisés, car ceux que fixent les arrêtés de DUP des captages ne sont pas publiés
            en données ouvertes. Les prélèvements proviennent de la BNPE. Un ouvrage est compté en zone de répartition des eaux s’il se situe dans
            une zone portant sur le même type de ressource (nappe ou cours d’eau). Six zones qui ne visent qu’une nappe profonde (Albien,
            Cénomanien, parties captives) sont exclues, faute de savoir quelle nappe chaque forage capte.
          </p>
          <p>
            La consommation et les fuites sont calculées à partir des volumes déclarés à SISPEA par les services qui distribuent l’eau ; la
            consommation par habitant rapporte ces volumes aux seuls résidents. Un service est exclu du calcul des fuites lorsque sa déclaration
            réunit deux signes d’invraisemblance : plus de 1 500 litres mis en distribution par habitant et par jour, et plus de la moitié de cette
            eau perdue. En 2024, une seule déclaration de ce type ajoutait plus de deux points à la part nationale.
          </p>
          <p>
            La protection des captages correspond à l’indicateur SISPEA P108.3, calculé en moyenne simple des services, selon la même méthode que
            le chiffre national publié.
          </p>
        </Regle>
        <Regle id="services" titre="Services d’eau">
          <p>
            Une commune adhère souvent à plusieurs entités de gestion, de production et de distribution ; le site retient celle qui porte le prix.
            Sur la carte des communes, chaque commune reçoit les indicateurs de ce service.
          </p>
          <p>
            La consommation et les fuites y sont recalculées service par service à partir des volumes déclarés, avec la même règle d’exclusion des
            déclarations invraisemblables ; un prix ou un rendement nul est traité comme une absence de déclaration. Les indicateurs du millésime
            en cours restent partiels tant que les collectivités n’ont pas achevé leur saisie.
          </p>
        </Regle>
        <Regle titre="Ventes de pesticides">
          <p>
            Elles sont localisées au siège du distributeur, et non sur les parcelles traitées. Elles indiquent donc le lieu d’achat des produits,
            qui ne correspond pas nécessairement au lieu d’épandage.
          </p>
        </Regle>
        <Regle titre="Seuils appliqués aux nappes et aux rivières">
          <p>
            Les seuils appliqués sont ceux des eaux brutes destinées à la production d’eau potable pour les rivières, et ceux de l’eau distribuée
            pour les nappes, afin de permettre la comparaison avec l’eau du robinet.
          </p>
        </Regle>
      </Section>

      <Section id="sources" titre="Sources des données" resume="Contrôle sanitaire, SISPEA, BNPE, ADES, VigiEau…">
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Sources de données utilisées</caption>
            <thead>
              <tr>
                <th>Source</th>
                <th>Ce qu’elle apporte</th>
                <th>Producteur</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Contrôle sanitaire de l’eau distribuée (SISE-Eaux)</td><td>chaque analyse réglementaire, par prélèvement, réseau et commune</td><td>ministère chargé de la Santé, via data.gouv.fr et Hub’Eau</td></tr>
              <tr><td>SISPEA</td><td>prix, rendement, renouvellement, mode de gestion, composition communale des services</td><td>Office français de la biodiversité</td></tr>
              <tr><td>BNPE</td><td>volumes prélevés pour l’eau potable, par ouvrage</td><td>OFB, via Hub’Eau</td></tr>
              <tr><td>BNV-D</td><td>ventes de substances phytopharmaceutiques, par département du distributeur</td><td>OFB, via Hub’Eau</td></tr>
              <tr><td>ADES</td><td>nitrates et pesticides dans les eaux souterraines</td><td>BRGM, via Hub’Eau</td></tr>
              <tr><td>Naïades</td><td>nitrates et pesticides dans les rivières</td><td>agences de l’eau, via Hub’Eau</td></tr>
              <tr><td>VigiEau</td><td>restrictions sécheresse en vigueur</td><td>ministère de la Transition écologique, en direct</td></tr>
              <tr><td>Donnée Sécheresse (ex-Propluvia)</td><td>historique des arrêtés de restriction depuis 2010, niveaux par zone depuis 2012</td><td>ministère de la Transition écologique, via data.gouv.fr</td></tr>
              <tr><td>Zones de répartition des eaux</td><td>zones de déficit structurel entre ressource et besoins</td><td>Sandre, services de l’État</td></tr>
              <tr><td>Piézométrie</td><td>niveau des nappes, mesures journalières des piézomètres</td><td>BRGM, via Hub’Eau</td></tr>
              <tr><td>Codes postaux</td><td>correspondance entre codes postaux et communes, pour la recherche</td><td>La Poste, via data.gouv.fr</td></tr>
              <tr><td>Contours administratifs</td><td>départements et communes</td><td>Etalab, IGN</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="limites" titre="Limites des données" resume="Petits réseaux, déclarations, données en direct">
        <ul>
          <li>Les petits réseaux font l’objet de peu de prélèvements ; un seul résultat positif pèse donc fortement sur leurs taux.</li>
          <li>Les données déclarées à SISPEA ne sont pas toutes vérifiées ; le statut de chaque service est affiché.</li>
          <li>Les données consultées en direct (Hub’Eau, VigiEau) peuvent être indisponibles pendant quelques minutes.</li>
          <li>La population desservie par chaque réseau n’est pas publiée en données ouvertes ; le site n’estime donc aucun nombre d’habitants concernés.</li>
        </ul>
        <p className="source">À chaque construction, les totaux sont comparés à ceux du millésime précédent ; un écart anormal empêche la publication des données.</p>
      </Section>

      <Section id="historique" titre="Historique des changements" resume={`Méthode de calcul, version du ${dateLongue(VERSION_METHODE)}`}>
        <p>
          Les changements qui modifient les notes A à D ou leur lecture. À chaque changement, les notes affichées sont recalculées pour
          toutes les années publiées.
        </p>
        <dl className="historique-methode">
          {HISTORIQUE_METHODE.map((c) => (
            <div key={c.date}>
              <dt>{dateLongue(c.date)}</dt>
              <dd>{c.texte}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  )
}

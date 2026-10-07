import { Fragment, useMemo } from 'react'
import { Link, useMatch, useParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Bulletin from '../components/Bulletin'
import { CartePrix, CarteQualite, CarteSecheresse, SavoirPlus, type LigneSavoir } from '../components/Cartes'
import Chargement from '../components/Chargement'
import Crumbs, { echelleFrance } from '../components/Crumbs'
import HorsGrilleCard from '../components/HorsGrilleCard'
import { AvisEau, CasesEau, Goutte } from '../components/MonEau'
import PourquoiClasse from '../components/PourquoiClasse'
import NappeCard from '../components/NappeCard'
import OrigineCard from '../components/OrigineCard'
import OuArrive from '../components/OuArrive'
import QualityStats from '../components/QualityStats'
import RepartitionFamilles from '../components/RepartitionFamilles'
import Search from '../components/Search'
import Signalement from '../components/Signalement'
import { signalementActif } from '../lib/signalement'
import Section from '../components/Section'
import SeriesAnnee from '../components/SeriesAnnee'
import { avisDuReseau, groupesAvis, sansInfoBulletin } from '../lib/avis'
import { comptes, type ReseauBulletin } from '../lib/bulletin'
import { avisMoment } from '../lib/enCeMoment'
import { useDepartements } from '../lib/geo'
import { lettrePourquoi, pourquoi, urlInfofacture } from '../lib/bilan'
import { useJson, useJsonAll, usePremierRendu } from '../lib/hooks'
import { avisSimple, casesEau, periodes, phraseNote, resultatsSimples, TITRES_NOTE, type PrixEau } from '../lib/monEau'
import { nomCompletReseau } from '../lib/nomsReseaux'
import { communesDuReseau, servicesDesCommunes } from '../lib/reseau'
import { descriptionReseau, enteteReseau, titreReseau } from '../lib/prerendu'
import { classeArs, type SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import {
  deptCode,
  type AvisDeptFile,
  type CommuneIndexEntry,
  type DeptFile,
  type MetaFile,
  type ParamsFile,
  type SispeaDeptFile,
} from '../lib/types'
import { anneesFiche, useAnneeDansAdresse, useYear } from '../lib/year'

/**
 * Fiche réseau de distribution (UDI), l'unité réelle des analyses du contrôle sanitaire, dans l'ordre de l'habitant comme
 * la fiche commune (maquette validée le 2026-10-06) : la qualité de l'eau avec l'année, la sécheresse du jour, le prix
 * et qui gère l'eau, puis « Pour en savoir plus », dont chaque ligne s'ouvre sur place ; le détail des analyses sur une
 * page à part (/reseau/:code/detail).
 */
export default function Reseau() {
  const { code = '' } = useParams()
  // « Le détail des analyses » : même fiche, vue à part (/reseau/:code/detail).
  const detail = !!useMatch('/reseau/:code/detail')

  const dept = deptCode(code.slice(0, 3))
  const file = useJson<DeptFile>(`dept/${dept}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const indexQ = useJson<CommuneIndexEntry[]>('communes.json')
  const index = indexQ.data
  const { names } = useDepartements()
  const r = file.data?.reseaux[code]
  const years = r?.stats ? Object.keys(r.stats).sort() : []
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [shared, setShared] = useYear(meta)
  const y = shared != null ? String(shared) : years[years.length - 1]
  const s = y && r?.stats ? r.stats[y] : undefined
  const situ = useJson<SituationsFile>(s ? `situations/${y}.json` : null)
  // Évolution de la note : les classes de toutes les années du réseau (fichiers en cache, partagés avec `situ`).
  const historique = useJsonAll<SituationsFile>(years.map((a) => `situations/${a}.json`))
  const anneeEnCours = meta?.partiel?.length ? String(Math.max(...meta.partiel)) : undefined
  const sEnCours = anneeEnCours ? r?.stats?.[anneeEnCours] : undefined
  const situEnCours = useJson<SituationsFile>(sEnCours ? `situations/${anneeEnCours}.json` : null)
  const avisQ = useJson<AvisDeptFile>(`avis/${dept}.json`)
  const avis = avisQ.data
  const sispeaQ = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  const sispea = sispeaQ.data
  // L'année affichée reste dans l'adresse, sans barre d'année en tête (refonte du 2026-10-05).
  useAnneeDansAdresse('annee', y ? Number(y) : undefined)
  // Noms des communes en casse normale (index des communes), le fichier départemental les écrivant en capitales.
  const noms = useMemo(() => {
    const m = new Map((index ?? []).map((e) => [e.c, e.n]))
    for (const [c, v] of Object.entries(file.data?.communes ?? {})) if (!m.has(c)) m.set(c, v.nom)
    return m
  }, [index, file.data])
  // Nom lisible (lib/nomsReseaux.ts), la commune de tête sous sa forme officielle parmi les communes desservies
  // (« SAINT QUENTIN BAS SERVICE » → « Saint-Quentin Bas service », comme les onglets de la fiche commune ; critique UX du
  // 2026-10-05) ; le nom du contrôle sanitaire et le code restent écrits au détail.
  const nom = nomCompletReseau(r?.nom, (y && file.data ? communesDuReseau(file.data, code, y) : []).map((c) => noms.get(c) ?? c)) || code
  const ars = classeArs(situ.data, code)
  // Mêmes titre et description que la page pré-générée du réseau (lib/prerendu.ts), lettre calculée comprise.
  usePageTitle(r ? titreReseau(nom) : null, r ? descriptionReseau(nom, code, y, ars?.classe) : null)
  // Le haut de la fiche (avis, note, cases) se dessine d'un seul tenant, à l'arrivée de ses données (usePremierRendu),
  // le nom lisible compris (index des communes : le nom en capitales du contrôle sanitaire changeait la coupure des lignes).
  const pret = usePremierRendu(!!file.data && !!params && !!meta && !situ.loading && !situEnCours.loading && !historique.loading && !avisQ.loading && !sispeaQ.loading && !indexQ.loading, code)

  // États d'erreur avec une issue (revue design du 2026-09-22) : cf. NotFound.tsx.
  if (file.error)
    return (
      <div className="page">
        <h1>Réseau introuvable</h1>
        <p className="muted">Aucune donnée n’a pu être chargée pour le réseau {code}. Vérifiez son code ou recherchez une commune par son nom.</p>
        <Search />
      </div>
    )
  if (!file.data || !params) return <Chargement reserve />
  const nomDept = names.get(dept) ?? dept
  if (!r)
    return (
      <div className="page">
        <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${dept}` }, { label: code }]} />
        <h1>Réseau {code}</h1>
        <p className="muted">Aucun réseau de distribution ne correspond à ce code.</p>
        <Search />
      </div>
    )

  const communes = y ? communesDuReseau(file.data, code, y) : []
  // En-tête : la desserte de la dernière année publiée, quelle que soit l'année affichée.
  const derniere = years[years.length - 1]
  const communesDerniere = derniere ? communesDuReseau(file.data, code, derniere) : []
  const reseaux: ReseauBulletin[] = [{ code, nom, situation: situ.data?.reseaux[code] ?? null, ars }]
  // Prix : celui du service des communes desservies ; un réseau qui en dessert plusieurs renvoie aux fiches des communes.
  const services = servicesDesCommunes(sispea, communes.length ? communes : communesDerniere)
  const prix: PrixEau = services.length > 1 ? 'plusieurs' : services[0] ? { prix: services[0].prix, annee: services[0].annee, id: services[0].id } : null
  const avisAnnee = avis
    ? avisMoment({
        annee: anneeEnCours,
        arret: anneeEnCours ? avis.arret?.[anneeEnCours] : undefined,
        lignes: avisDuReseau(avis.communes, code),
        textes: avis.textes,
        derniers: anneeEnCours ? avis.derniers?.[anneeEnCours] : undefined,
        sansInfo: anneeEnCours ? sansInfoBulletin(avis, [code], anneeEnCours, (d) => names.get(d) ?? d) : null,
        stats: sEnCours,
        reseaux: [{ code, nom, situation: situEnCours.data?.reseaux[code] ?? null }],
        lieu: 'sur ce réseau',
      })
    : null
  const resultats =
    anneeEnCours && situEnCours.data ? resultatsSimples({ situation: situEnCours.data.reseaux[code], stats: sEnCours, params: params.params, annee: anneeEnCours }) : null
  const evolution = anneesFiche(meta, years)
    .filter((a) => !a.sansDonnees)
    .map((a) => {
      const f = historique.data?.[years.indexOf(String(a.annee))]
      return { annee: String(a.annee), libelle: a.enCours ? `${a.annee} (en cours)` : String(a.annee), lettre: f ? (classeArs(f, code)?.classe ?? null) : null }
    })
  const cases = y ? casesEau({ situation: reseaux[0].situation, stats: s, params: params.params, annee: y, prix, historique: r.stats }) : []
  const familles = s && situ.data ? pourquoi([{ ...reseaux[0], stats: s }], params.params, y!) : []
  const lettre = lettrePourquoi(reseaux, familles)
  // Note du réseau en une phrase, et la synthèse de l'ARS d'une année close (« Pourquoi cette note »).
  const phrase = y ? phraseNote({ lettre: ars?.classe ?? null, familles: ars?.familles ?? {}, reportees: ars?.reportees ?? [], situation: reseaux[0].situation, annee: y }) : null
  const pdf = y ? urlInfofacture(code, y) : null
  const avisCarte = avisAnnee ? avisSimple(avisAnnee, anneeEnCours ? avis?.arret?.[anneeEnCours] : undefined) : null
  // Sécheresse : le niveau de la commune de tête du réseau (celle qui ouvre son nom, à défaut la première desservie) ;
  // les restrictions sont fixées par zone, et les communes d'un même réseau peuvent relever de zones différentes.
  const communeTete = communesDerniere.find((c) => nom.startsWith(noms.get(c) ?? c)) ?? communesDerniere[0]

  const tete = (
    <>
      <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${dept}` }, { label: `Réseau ${nom}` }]} />
      <div className="fiche-tete">
        <h1 className="h1-udi">{nom}</h1>
        <p className="meta">{enteteReseau(nomDept, communesDerniere.length)}</p>
      </div>
    </>
  )
  if (!pret)
    return (
      <div className="page fiche fiche2">
        {tete}
        <Chargement reserve />
      </div>
    )

  const lignes: LigneSavoir[] = [
    {
      id: 'pourquoi',
      titre: 'Pourquoi cette note',
      aussi: ['note', 'cases'],
      contenu: s && y ? (
        <>
          <div className="savoir-note">
            <p className="savoir-sur">{periodes(y).Periode}</p>
            <p>
              <b>{ars ? TITRES_NOTE[ars.classe] : 'Pas de note'}.</b> {phrase}
            </p>
            {pdf && (
              <p>
                <a href={pdf} target="_blank" rel="noopener noreferrer">
                  Synthèse de l’ARS jointe à la facture d’eau (PDF)
                </a>
              </p>
            )}
          </div>
          {lettre && familles.length > 0 && <PourquoiClasse lettre={lettre} familles={familles} />}
          <CasesEau key={y} cases={cases} annee={y} />
        </>
      ) : (
        <p className="etat-vide" role="status">
          Aucun contrôle n’est enregistré sur ce réseau {y ? periodes(y).periode : ''}.
        </p>
      ),
    },
    {
      id: 'evolution',
      titre: `L’évolution depuis ${years[0] ?? ''}`.trim(),
      aussi: ['mois'],
      contenu: (
        <>
          {evolution.length > 1 && (
            <div className="me-evolution">
              <h3>Notes des années publiées</h3>
              <ol>
                {evolution.map((e) => (
                  <li key={e.annee} aria-current={e.annee === y ? 'true' : undefined}>
                    <Goutte lettre={e.lettre} petite />
                    <span>{e.libelle}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {s && y && (
            <>
              <h3 className="savoir-h3">Mois par mois {periodes(y).periode}</h3>
              <p className="me-aide">La valeur la plus haute mesurée chaque mois, face à sa limite.</p>
              <SeriesAnnee dept={dept} reseaux={[code]} annee={y} params={params} />
            </>
          )}
        </>
      ),
    },
    {
      id: 'avis',
      titre: 'Avis de l’ARS et derniers contrôles',
      aussi: ['en-ce-moment'],
      contenu: <AvisEau avis={avisAnnee} arret={anneeEnCours ? avis?.arret?.[anneeEnCours] : undefined} annee={anneeEnCours} resultats={resultats} />,
    },
    {
      // Ouvrages de toutes les communes desservies ; la nappe et son niveau, ceux de la commune de tête, nommée.
      id: 'origine',
      titre: 'D’où vient l’eau',
      aussi: ['ressource', 'nappe'],
      contenu: (
        <>
          <OrigineCard insee={communeTete ?? ''} dept={dept} communes={communesDerniere} />
          {communeTete && (
            <>
              {communesDerniere.length > 1 && <p className="carte2-note">Autour de {noms.get(communeTete) ?? communeTete}, l’une des communes desservies par ce réseau.</p>}
              <NappeCard insee={communeTete} dept={dept} />
            </>
          )}
        </>
      ),
    },
    {
      id: 'ouarrive',
      titre: 'Où arrive cette eau, et qui la distribue',
      aussi: ['qui', 'distribue'],
      contenu: (
        <>
          <OuArrive dept={dept} annee={y ?? ''} communes={communes} noms={noms} dist={r.dist} uge={r.uge} titre={false} />
          <p className="cap">
            Code du réseau {code}
            {r.nom?.trim() && ` ; nom au contrôle sanitaire : ${r.nom.trim()}`}.
          </p>
        </>
      ),
    },
    { id: 'detail', titre: 'Le détail des analyses', vers: `/reseau/${code}/detail${y ? `?annee=${y}` : ''}` },
    { id: 'methode', titre: 'Comment la note est calculée', vers: '/methode#classe-ars' },
    ...(signalementActif() ? [{ id: 'signaler', titre: 'Signaler une erreur sur cette page', contenu: <Signalement annee={y} /> }] : []),
  ]

  const SOURCE = (
    <div className="source">
      Sources : contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, via data.gouv.fr) ; services d’eau, observatoire SISPEA (OFB) ;
      restrictions sécheresse (VigiEau). Le site n’est pas une publication officielle : pour toute consigne sanitaire, la mairie et l’ARS font foi ;
      pour la note, la synthèse annuelle de l’ARS jointe à la facture d’eau fait foi. <Link to="/methode#lexique">Les mots du site</Link>
    </div>
  )

  // Page « Le détail des analyses » (/reseau/:code/detail) : le bulletin complet, les analyses, les substances sans
  // limite et les analyses par famille, ouverts, pour l'année de la fiche (maquette du 2026-10-06).
  if (detail)
    return (
      <div className="page fiche">
        <Crumbs
          items={[
            echelleFrance,
            { label: nomDept, to: `/departement/${dept}` },
            { label: `Réseau ${nom}`, to: `/reseau/${code}${y ? `?annee=${y}` : ''}` },
            { label: 'Le détail des analyses' },
          ]}
        />
        <h1>{nom} · le détail des analyses</h1>
        <BarreAnnee titre="Année du bilan" note="Elle vaut pour toute la page." annees={anneesFiche(meta, years)} annee={y ? Number(y) : undefined} onChange={setShared} />
        {s && situ.data ? (
          <>
            <Section id="bulletin" aussi={['detail']} titre="Le bulletin complet" resume={`Toutes les familles et les avis de l’ARS ${periodes(y!).periode}`} ouvert>
              <Bulletin
                question="Qualité de l’eau de ce réseau"
                annee={y!}
                reseaux={reseaux}
                stats={() => s}
                params={params.params}
                avis={avis ? groupesAvis(avisDuReseau(avis.communes, code), avis.textes, y!, y === anneeEnCours ? avis.derniers?.[y] : undefined) : []}
                arret={y === anneeEnCours ? avis?.arret?.[y] : undefined}
                sansInfo={sansInfoBulletin(avis, [code], y!, (d) => names.get(d) ?? d)}
                comptes={comptes(s)}
              />
            </Section>
            <Section id="analyses" titre="Les limites dépassées" resume={`Et les principaux paramètres mesurés ${periodes(y!).periode}`} ouvert>
              <QualityStats s={s} params={params} year={y!} />
            </Section>
            <Section id="horsgrille" titre="Substances sans limite" resume={`Substances trouvées dans l’eau qui n’ont pas de limite réglementaire ${periodes(y!).periode}`} ouvert>
              <HorsGrilleCard s={s} params={params} year={y!} />
            </Section>
            <Section id="familles" titre="Analyses par famille" resume={`Nombre d’analyses et de dépassements, famille par famille, ${periodes(y!).periode}`} ouvert>
              <RepartitionFamilles s={s} params={params} />
            </Section>
          </>
        ) : !s ? (
          <div className="etat-vide" role="status">
            <p>
              <b>Aucun contrôle n’est enregistré sur ce réseau {y ? periodes(y).periode : ''}.</b>
            </p>
            {years.length > 0 && (
              <p>
                {years.length > 1 ? 'Années disponibles' : 'Année disponible'} :{' '}
                {[...years].reverse().map((a, i) => (
                  <Fragment key={a}>
                    {i > 0 && ', '}
                    <Link to={{ search: `?annee=${a}` }}>{a}</Link>
                  </Fragment>
                ))}
                .
              </p>
            )}
          </div>
        ) : (
          <Chargement />
        )}
        {SOURCE}
      </div>
    )

  return (
    <div className="page fiche fiche2">
      {tete}
      <div className="cartes-fiche">
        {y ? (
          <CarteQualite
            reseaux={s ? reseaux : []}
            choisi={code}
            surChoix={() => {}}
            annee={y}
            annees={anneesFiche(meta, years)}
            onAnnee={setShared}
            avis={avisCarte}
            ancreAvis="#avis"
            vide={`Aucun contrôle n’est enregistré sur ce réseau ${periodes(y).periode}.`}
          />
        ) : (
          <p className="etat-vide" role="status">
            Aucun contrôle n’est enregistré sur ce réseau.
          </p>
        )}
        {communeTete && <CarteSecheresse insee={communeTete} commune={communesDerniere.length > 1 ? (noms.get(communeTete) ?? communeTete) : undefined} />}
        <CartePrix service={services.length === 1 ? services[0] : null} plusieurs={services.length > 1} />
        <SavoirPlus lignes={lignes} />
      </div>
      {SOURCE}
    </div>
  )
}

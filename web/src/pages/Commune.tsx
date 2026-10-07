import { useState } from 'react'
import { Link, Navigate, useLocation, useMatch, useParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Bulletin from '../components/Bulletin'
import { CartePrix, CarteQualite, CarteSecheresse, SavoirPlus, type LigneSavoir } from '../components/Cartes'
import Chargement from '../components/Chargement'
import Crumbs, { echelleFrance } from '../components/Crumbs'
import HorsGrilleCard from '../components/HorsGrilleCard'
import { AvisEau, CasesEau, Goutte } from '../components/MonEau'
import NappeCard from '../components/NappeCard'
import OrigineCard from '../components/OrigineCard'
import PourquoiClasse from '../components/PourquoiClasse'
import QualityStats from '../components/QualityStats'
import QuiDistribue from '../components/QuiDistribue'
import RepartitionFamilles from '../components/RepartitionFamilles'
import Search from '../components/Search'
import Signalement from '../components/Signalement'
import { signalementActif } from '../lib/signalement'
import Section from '../components/Section'
import SeriesAnnee from '../components/SeriesAnnee'
import VigiEauCard from '../components/VigiEauCard'
import { groupesAvis, sansInfoBulletin } from '../lib/avis'
import { lettrePourquoi, lettresDistinctes, pourquoi, urlInfofacture } from '../lib/bilan'
import { comptes, ordreReseaux, TITRE_BULLETIN_COMMUNE, type ReseauBulletin } from '../lib/bulletin'
import { avisMoment } from '../lib/enCeMoment'
import { useDepartements } from '../lib/geo'
import { useJson, useJsonAll, usePremierRendu } from '../lib/hooks'
import { avisSimple, casesEau, periodes, phraseNote, resultatsSimples, TITRES_NOTE } from '../lib/monEau'
import { nomLisibleReseau } from '../lib/nomsReseaux'
import { descriptionCommune, titreCommune } from '../lib/prerendu'
import { classeArs, type SituationsFile } from '../lib/situations'
import { serviceDeCommune } from '../lib/sispea'
import { usePageTitle } from '../lib/title'
import {
  communeDeRattachement,
  deptOfInsee,
  type AvisDeptFile,
  type CommuneIndexEntry,
  type DeptFile,
  type MetaFile,
  type ParamsFile,
  type SispeaDeptFile,
} from '../lib/types'
import { anneesFiche, useAnneeDansAdresse, useYear } from '../lib/year'

/**
 * Fiche commune, « Mon eau » (refonte complète du 2026-10-05, complétée le même jour : « il manque des sections et des
 * détails », « il manque prix, nappes, sécheresse ») : écrite pour l'habitant, elle montre tout, dans cet ordre :
 * l'avis de l'ARS et les derniers contrôles de l'année en cours ; la note de chaque réseau, celle du réseau choisi sur
 * son échelle et son évolution ; « Pourquoi la note », avec ses jauges ; ce qu'on trouve dans l'eau ; le mois par mois ;
 * qui distribue l'eau et à quel prix ; la ressource du jour (prélèvements, sécheresse, nappes). Seuls le bulletin
 * technique, les analyses, les substances sans limite et la répartition par famille restent repliés.
 */
export default function Commune() {
  const { code = '' } = useParams()
  const { search } = useLocation()
  // « Le détail des analyses » : même fiche, vue à part (/commune/:code/detail).
  const detail = !!useMatch('/commune/:code/detail')
  const dept = deptOfInsee(code)
  const file = useJson<DeptFile>(`dept/${dept}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const c = file.data?.communes[code]
  const meta = useJson<MetaFile>('meta.json').data
  const { names } = useDepartements()
  // Nom de la commune en casse normale (index des communes) : le contrôle sanitaire l'écrit en capitales
  // (« BORDEAUX »), ce qui jurait avec le reste du site (revue du 2026-09-22).
  const indexQ = useJson<CommuneIndexEntry[]>('communes.json')
  const index = indexQ.data
  const nom = index?.find((e) => e.c === code)?.n ?? c?.nom ?? code
  const years = c ? Object.keys(c.stats).sort() : []
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [shared, setShared] = useYear(meta)
  const y = shared != null ? String(shared) : years[years.length - 1]
  const s = y ? c?.stats[y] : undefined
  const situ = useJson<SituationsFile>(s ? `situations/${y}.json` : null)
  // Évolution de la note : les classes de toutes les années de la commune (fichiers en cache, partagés avec `situ`).
  const historique = useJsonAll<SituationsFile>(years.map((a) => `situations/${a}.json`))
  const anneeEnCours = meta?.partiel?.length ? String(Math.max(...meta.partiel)) : undefined
  const sEnCours = anneeEnCours ? c?.stats[anneeEnCours] : undefined
  const situEnCours = useJson<SituationsFile>(sEnCours ? `situations/${anneeEnCours}.json` : null)
  const avisQ = useJson<AvisDeptFile>(`avis/${dept}.json`)
  const avis = avisQ.data
  const sispeaQ = useJson<SispeaDeptFile>(`sispea/dept/${dept}.json`)
  const sispea = sispeaQ.data
  // L'année affichée reste dans l'adresse, sans barre d'année en tête (refonte du 2026-10-05).
  useAnneeDansAdresse('annee', y ? Number(y) : undefined)
  // Réseau choisi : il gouverne la note, « Pourquoi la note », les cases, le mois par mois et le bulletin du détail.
  const [reseauChoisi, choisirReseau] = useState<string | null>(null)
  const nomDept = names.get(dept) ?? dept
  const codes = (y && c?.reseaux[y]) || []
  const reseauxInfo = file.data?.reseaux ?? {}
  // Noms lisibles ; la commune à plusieurs réseaux perd son nom en tête (« Haut service »), le code reste au détail.
  const nomReseau = (r: string, n: number) => nomLisibleReseau(reseauxInfo[r]?.nom ?? r, n > 1 ? nom : undefined)
  const reseaux: ReseauBulletin[] = codes.map((r) => ({ code: r, nom: nomReseau(r, codes.length), situation: situ.data?.reseaux[r] ?? null, ars: classeArs(situ.data, r) }))
  // Mêmes titre et description que la page pré-générée de la commune (lib/prerendu.ts), lettre calculée comprise.
  usePageTitle(c ? titreCommune(nom, dept) : null, c ? descriptionCommune(nom, y, situ.data ? lettresDistinctes(reseaux) : []) : null)
  // Le haut de la fiche (avis, note, cases) se dessine d'un seul tenant, à l'arrivée de ses données (usePremierRendu),
  // le nom lisible compris (index des communes : le nom en capitales du contrôle sanitaire changeait la coupure des lignes).
  const pret = usePremierRendu(!!file.data && !!params && !!meta && !situ.loading && !situEnCours.loading && !historique.loading && !avisQ.loading && !sispeaQ.loading && !indexQ.loading, code)

  // Arrondissement de Paris, Marseille ou Lyon : le contrôle sanitaire ne connaît que la commune, sa fiche est celle
  // de la commune (un clic sur la carte ou un lien ancien y menait vers une fiche vide ; vérification du 24/09).
  const rattache = communeDeRattachement(code)
  if (rattache !== code) return <Navigate to={{ pathname: `/commune/${rattache}`, search }} replace />

  // Constat sans issue → avec une issue (revue design du 2026-09-22) : cf. NotFound.tsx.
  if (file.error)
    return (
      <div className="page">
        <h1>Commune introuvable</h1>
        <p className="muted">Aucune donnée n’a pu être chargée pour le code {code}. Vérifiez ce code INSEE ou recherchez la commune par son nom.</p>
        <Search />
      </div>
    )
  if (!file.data || !params) return <Chargement reserve />
  if (!c)
    return (
      <div className="page">
        <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${dept}` }, { label: code }]} />
        <h1>Commune {code}</h1>
        <p className="muted">Aucune donnée du contrôle sanitaire n’est disponible pour ce code INSEE.</p>
        <Search />
      </div>
    )

  // Distributeurs des réseaux de l'année, une fois chacun (Bordeaux : six réseaux d'une même régie).
  const distributeurs = [...new Set(codes.map((r) => reseauxInfo[r]?.dist).filter((d): d is string => !!d))]
  const ordre = ordreReseaux(reseaux)
  const r = ordre.find((x) => x.code === reseauChoisi) ?? ordre[0]
  const statsR = r ? reseauxInfo[r.code]?.stats?.[y!] : undefined
  const service = serviceDeCommune(sispea, code)
  const cases = r && y ? casesEau({ situation: r.situation, stats: statsR, params: params.params, annee: y, prix: service ? { prix: service.prix, annee: service.annee, id: service.id } : null, historique: reseauxInfo[r.code]?.stats }) : []
  const familles = r && statsR && situ.data ? pourquoi([{ ...r, stats: statsR }], params.params, y!) : []
  const lettre = r ? lettrePourquoi([r], familles) : null

  // Avis de l'année en cours (lib/enCeMoment, avisMoment), rapporté en mots simples (lib/monEau) avec les derniers
  // contrôles du réseau choisi s'il est encore desservi cette année, sinon du premier réseau de l'année.
  const codesEnCours = (anneeEnCours && c.reseaux[anneeEnCours]) || []
  const reseauxEnCours = codesEnCours.map((x) => ({ code: x, nom: nomReseau(x, codesEnCours.length), situation: situEnCours.data?.reseaux[x] ?? null }))
  const avisAnnee = avis
    ? avisMoment({
        annee: anneeEnCours,
        arret: anneeEnCours ? avis.arret?.[anneeEnCours] : undefined,
        lignes: avis.communes[code] ?? [],
        textes: avis.textes,
        derniers: anneeEnCours ? avis.derniers?.[anneeEnCours] : undefined,
        sansInfo: anneeEnCours ? sansInfoBulletin(avis, codesEnCours, anneeEnCours, (d) => names.get(d) ?? d) : null,
        stats: sEnCours,
        reseaux: reseauxEnCours,
        lieu: `à ${nom}`,
      })
    : null
  const codeEnCours = r && codesEnCours.includes(r.code) ? r.code : codesEnCours[0]
  const resultats =
    anneeEnCours && codeEnCours && situEnCours.data
      ? resultatsSimples({ situation: situEnCours.data.reseaux[codeEnCours], stats: reseauxInfo[codeEnCours]?.stats?.[anneeEnCours], params: params.params, annee: anneeEnCours })
      : null
  const evolution = anneesFiche(meta, years)
    .filter((a) => !a.sansDonnees)
    .map((a) => {
      const f = historique.data?.[years.indexOf(String(a.annee))]
      return { annee: String(a.annee), libelle: a.enCours ? `${a.annee} (en cours)` : String(a.annee), lettre: r && f ? (classeArs(f, r.code)?.classe ?? null) : null }
    })

  const tete = (
    <>
      <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${dept}` }, { label: nom }]} />
      <div className="fiche-tete">
        <h1>{nom}</h1>
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

  // Note du réseau choisi en une phrase, et la synthèse de l'ARS d'une année close (« Pourquoi ces notes »).
  const lettreR = r?.ars?.classe ?? null
  const phraseR = r && y ? phraseNote({ lettre: lettreR, familles: r.ars?.familles ?? {}, reportees: r.ars?.reportees ?? [], situation: r.situation, annee: y }) : null
  const pdf = r && y ? urlInfofacture(r.code, y) : null
  const avisCarte = avisAnnee ? avisSimple(avisAnnee, anneeEnCours ? avis?.arret?.[anneeEnCours] : undefined) : null
  const surReseau = ordre.length > 1 && r ? `Réseau ${r.nom} · ` : ''

  const lignes: LigneSavoir[] = [
    {
      id: 'pourquoi',
      titre: 'Pourquoi ces notes',
      aussi: ['note', 'cases'],
      contenu: (
        <>
          {r && y && (
            <div className="savoir-note">
              <p className="savoir-sur">
                {surReseau}
                {periodes(y).Periode}
              </p>
              <p>
                <b>{lettreR ? TITRES_NOTE[lettreR] : 'Pas de note'}.</b> {phraseR}
              </p>
              {pdf && (
                <p>
                  <a href={pdf} target="_blank" rel="noopener noreferrer">
                    Synthèse de l’ARS jointe à la facture d’eau (PDF)
                  </a>
                </p>
              )}
            </div>
          )}
          {lettre && familles.length > 0 && <PourquoiClasse lettre={lettre} familles={familles} />}
          {y && <CasesEau key={`${r?.code}-${y}`} cases={cases} annee={y} />}
        </>
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
              <h3>{surReseau}Notes des années publiées</h3>
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
          {r && y && (
            <>
              <h3 className="savoir-h3">Mois par mois {periodes(y).periode}</h3>
              <p className="me-aide">La valeur la plus haute mesurée chaque mois{ordre.length > 1 ? ` sur le réseau ${r.nom}` : ''}, face à sa limite.</p>
              <SeriesAnnee dept={dept} reseaux={[r.code]} annee={y} params={params} />
            </>
          )}
        </>
      ),
    },
    {
      id: 'avis',
      titre: 'Avis de l’ARS et derniers contrôles',
      aussi: ['en-ce-moment'],
      contenu: (
        <AvisEau
          avis={avisAnnee}
          arret={anneeEnCours ? avis?.arret?.[anneeEnCours] : undefined}
          annee={anneeEnCours}
          resultats={resultats}
          reseau={codesEnCours.length > 1 ? reseauxEnCours.find((x) => x.code === codeEnCours)?.nom : undefined}
        />
      ),
    },
    {
      id: 'origine',
      titre: 'D’où vient l’eau',
      aussi: ['ressource', 'secheresse', 'nappe'],
      contenu: (
        <>
          <OrigineCard insee={code} dept={dept} />
          <NappeCard insee={code} dept={dept} />
          <VigiEauCard insee={code} />
        </>
      ),
    },
    {
      id: 'distribue',
      titre: 'Qui distribue l’eau',
      aussi: ['qui', 'service'],
      contenu: y ? <QuiDistribue insee={code} dept={dept} annee={y} reseaux={reseaux} distributeurs={distributeurs} sansTitre /> : null,
    },
    { id: 'detail', titre: 'Le détail des analyses', vers: `/commune/${code}/detail${y ? `?annee=${y}` : ''}` },
    { id: 'methode', titre: 'Comment la note est calculée', vers: '/methode#classe-ars' },
    ...(signalementActif() ? [{ id: 'signaler', titre: 'Signaler une erreur sur cette page', contenu: <Signalement annee={y} /> }] : []),
  ]

  const SOURCE = (
    <div className="source">
      Sources : contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, via data.gouv.fr) ; services d’eau, observatoire SISPEA (OFB) ;
      ouvrages de prélèvement (BNPE), nappes (ADES, Hub’Eau) et restrictions sécheresse (VigiEau). Le site n’est pas une publication officielle :
      pour toute consigne sanitaire, la mairie et l’ARS font foi ; pour la note, la synthèse annuelle de l’ARS jointe à la facture d’eau fait foi.{' '}
      <Link to="/methode#lexique">Les mots du site</Link>
    </div>
  )

  // Page « Le détail des analyses » (/commune/:code/detail) : le bulletin complet, les analyses, les substances sans
  // limite et les analyses par famille, ouverts, pour l'année de la fiche (maquette du 2026-10-06 : des pages à part,
  // jamais une section repliée dans une autre).
  if (detail)
    return (
      <div className="page fiche">
        <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${dept}` }, { label: nom, to: `/commune/${code}${y ? `?annee=${y}` : ''}` }, { label: 'Le détail des analyses' }]} />
        <h1>{nom} · le détail des analyses</h1>
        <BarreAnnee titre="Année du bilan" note="Elle vaut pour toute la page." annees={anneesFiche(meta, years)} annee={y ? Number(y) : undefined} onChange={setShared} />
        {s && situ.data ? (
          <>
            <Section id="bulletin" aussi={['detail']} titre="Le bulletin complet" resume={`Toutes les familles, tous les réseaux et les avis de l’ARS ${periodes(y!).periode}`} ouvert>
              <Bulletin
                question={TITRE_BULLETIN_COMMUNE}
                annee={y!}
                reseaux={reseaux}
                stats={(x) => reseauxInfo[x]?.stats?.[y!]}
                params={params.params}
                avis={avis ? groupesAvis(avis.communes[code] ?? [], avis.textes, y!, y === anneeEnCours ? avis.derniers?.[y] : undefined) : []}
                arret={y === anneeEnCours ? avis?.arret?.[y] : undefined}
                sansInfo={sansInfoBulletin(avis, codes, y!, (d) => names.get(d) ?? d)}
                comptes={comptes(s)}
                choisi={r?.code ?? null}
                surChoix={choisirReseau}
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
        ) : (
          <p className="etat-vide" role="status">
            Aucun contrôle n’est enregistré à {nom} {y ? periodes(y).periode : ''}.
          </p>
        )}
        <p>
          <Link to={{ pathname: `/commune/${code}/analyses`, search: y ? `?annee=${y}` : '' }}>Toutes les analyses réglementaires, chaque résultat</Link>
        </p>
        {SOURCE}
      </div>
    )

  return (
    <div className="page fiche fiche2">
      {tete}
      <div className="cartes-fiche">
        {y ? (
          <CarteQualite
            reseaux={ordre}
            choisi={r?.code ?? null}
            surChoix={choisirReseau}
            annee={y}
            annees={anneesFiche(meta, years)}
            onAnnee={setShared}
            avis={avisCarte}
            ancreAvis="#avis"
          />
        ) : (
          <p className="etat-vide" role="status">
            Aucun contrôle n’est enregistré à {nom}.
          </p>
        )}
        <CarteSecheresse insee={code} />
        <CartePrix service={service} />
        <SavoirPlus lignes={lignes} />
      </div>
      {SOURCE}
    </div>
  )
}

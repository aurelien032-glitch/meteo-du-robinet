import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import { CarteNotesAgregat, CartePrixAgregat, CarteSecheresseDepartement, EvolutionNotes, SavoirPlus, type LigneSavoir } from '../components/Cartes'
import CarteClassesCommunes from '../components/CarteClassesCommunes'
import CommunesAvis, { type CommuneListee } from '../components/CommunesAvis'
import Crumbs from '../components/Crumbs'
import DeptRessourceCard from '../components/DeptRessourceCard'
import DeptPressionCard from '../components/DeptPressionCard'
import DeptHorsGrille from '../components/DeptHorsGrille'
import DeptServicesAmont from '../components/DeptServicesAmont'
import IndicInconnu from '../components/IndicInconnu'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import PhraseAgregat from '../components/PhraseAgregat'
import ReseauxConcernes from '../components/ReseauxConcernes'
import Signalement from '../components/Signalement'
import { signalementActif } from '../lib/signalement'
import { departementSansInformation, phraseCarteSansInformation, reseauxConsignes } from '../lib/avis'
import { comptesParDepartement, PHRASE_CLASSE_C, PHRASE_ECART_NOTE } from '../lib/france'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson, usePremierRendu } from '../lib/hooks'
import { echelleCommune, etatCommune, infoBulleCommune, INDICS_COMMUNES, niveauxCommune, valeurCommune, type IndicCommuneKey } from '../lib/indicateursCommunes'
import {
  legendeSituation,
  nonConformes,
  reseauxAnalyses,
  SEUILS_NITRATES,
  type FamilleSitu,
  type SituationsFile,
} from '../lib/situations'
import {
  AVIS_SANS_INFORMATION, communeDeRattachement, deptOfInsee, siseOfDept,
  type AvisDeptFile, type AvisNationalFile, type CommuneIndexEntry, type MapFile, type MapRow, type MetaFile, type NationalFile, type ParamsFile, type SispeaNationalFile,
} from '../lib/types'
import { groupeHg } from '../lib/horsGrille'
import { anneesFiche, useYear } from '../lib/year'
import { usePageTitle } from '../lib/title'
import Kpi from '../components/Kpi'

/**
 * Mêmes indicateurs et mêmes clés que /carte (choix de l'auteur, 24/09 ; lib/indicateursCommunes.ts), et ouverture sur
 * « Toutes familles » : sur les seuls pesticides, un département sans dépassement semblait sans problème.
 */
const INDICS = [...INDICS_COMMUNES.filter((i) => i.key === 'any'), ...INDICS_COMMUNES.filter((i) => i.key !== 'any')]
/** Défaut de la page : « Toutes familles ». */
const INDIC_DEFAUT: IndicCommuneKey = 'any'
/**
 * Indicateur « Classes A–D » de « La France » et de /carte (lot 3) : il désigne le bilan en tête de fiche, qui n'est pas
 * l'un des indicateurs de la section des familles.
 */
const INDIC_CLASSES = 'classes'

/**
 * Fiche département, dans l'ordre de l'habitant (maquette « Vision d'ensemble » validée le 2026-10-06 ; lot 3, 07/10) :
 * la qualité de l'eau de l'année choisie (part des réseaux notés C ou D, répartition A–D, carte communale de la note la
 * plus défavorable, avis de l'ARS), la sécheresse du jour, le prix et la gestion ; puis « Pour en savoir plus », dont
 * chaque ligne s'ouvre sur place : les réseaux notés C ou D, les familles et les avis de l'ARS commune par commune,
 * l'évolution, la ressource et les nappes, les services d'eau, les substances sans limite, les pressions. Les ancres des
 * liens du site (#familles, #ressource, #services, #hors-grille, #pressions) ouvrent leur ligne.
 */
export default function Departement() {
  const { dd = '' } = useParams()
  const sise = siseOfDept(dd)
  const nav = useNavigate()
  const meta = useJson<MetaFile>('meta.json').data
  // Ouverture sur la dernière année complète, comme les fiches commune et réseau (lot 1) et « La France » (lot 3).
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  const nat = useJson<NationalFile>('national.json').data
  const params = useJson<ParamsFile>('params.json').data
  const map = useJson<MapFile>(y ? `map/${y}.json` : null).data
  const communes = useJson<FeatureCollection>(`geo/communes/${dd}.json`).data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const situ = useJson<SituationsFile>(y ? `situations/${y}.json` : null).data
  const { names } = useDepartements()
  // L'indicateur de cette page vit dans sa propre clé d'URL (« vue »), distincte de « indic » (la carte) :
  // en repartant, la carte doit retrouver l'indicateur qu'on regardait EN Y ARRIVANT, pas un choix fait
  // depuis en changeant d'avis sur la fiche département (cf. retourCarte, qui efface « vue » et laisse
  // « indic » intact). Mais à l'arrivée, si « vue » n'a encore jamais été touchée sur cette page, c'est bien
  // « indic » qui doit décider de ce qui s'affiche — sans ce repli, le choix fait sur la carte (ex. Nitrates)
  // retombait toujours sur « Pesticides » en arrivant ici (bug relevé lors de la revue du 2026-09-22).
  const [sp, setSp] = useSearchParams()
  const indicUrl = sp.get('vue') ?? sp.get('indic')
  const indic = (INDICS.some((i) => i.key === indicUrl) ? indicUrl : INDIC_DEFAUT) as IndicCommuneKey
  const indicInconnu = !!indicUrl && indicUrl !== INDIC_CLASSES && !INDICS.some((i) => i.key === indicUrl)
  // Un indicateur de famille ou d'avis venu de l'adresse (lienDepartement, retour de la carte) déplie sa section.
  const familleDemandee = !!indicUrl && indicUrl !== INDIC_CLASSES
  const setIndic = (v: IndicCommuneKey) => {
    const next = new URLSearchParams(sp)
    // « vue » ne s'efface que si la carte n'impose pas d'indicateur : sinon « Toutes familles » retombait sur celui de
    // la carte (relecture du 25/09).
    if (v === INDIC_DEFAUT && !sp.has('indic')) next.delete('vue')
    else next.set('vue', v)
    setSp(next)
  }
  const retourCarte = useMemo(() => {
    const q = new URLSearchParams(sp)
    q.delete('vue') // propre à cette page ; la carte n'a pas cette clé
    q.delete('groupe') // groupe de substances venu de /hors-grille, que la carte ne connaît pas
    // Sans indicateur d'arrivée, la carte s'ouvre sur les classes, que la tête de la fiche présente.
    if (!q.has('indic')) q.set('indic', INDIC_CLASSES)
    q.set('dept', dd)
    return `/carte?${q.toString()}`
  }, [sp, dd])
  const ind = INDICS.find((i) => i.key === indic)!
  // Délégation « sans information » (avis.sans_information du pipeline) : lue pour l'indicateur des avis seulement.
  const avisQ = useJson<AvisNationalFile>('avis/national.json')
  const avisNat = avisQ.data
  // Conclusions de l'ARS du département : réseaux sous restriction de consommation ou consigne d'ébullition (carte « Qualité »).
  const avisDept = useJson<AvisDeptFile>(`avis/${dd}.json`)
  const sispea = useJson<SispeaNationalFile>('sispea/national.json')
  const deptMuet = ind.key === 'avis' && y != null && departementSansInformation(avisNat, dd, String(y))
  const scale = useMemo(() => echelleCommune(ind), [ind])
  const communeNames = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const [survol, setSurvol] = useState<string | null>(null)
  const [survolBilan, setSurvolBilan] = useState<string | null>(null)
  // Réseaux du département par classe A–D (même règle que « La France » et l'accueil).
  const comptes = useMemo(() => comptesParDepartement(situ).get(dd) ?? null, [situ, dd])
  // Description alignée sur la page statique (scripts/routes-statiques.mjs) ; plus de « communes touchées », que la
  // règle du projet écarte (l'unité est le réseau).
  usePageTitle(
    names.get(dd) ? `${names.get(dd)} · eau du robinet` : null,
    `Qualité de l'eau du robinet dans le département ${names.get(dd) ?? ''} (${dd}) : situation des réseaux, avis de l'ARS, services d'eau, amont.`,
  )

  const pret = usePremierRendu(!!meta && !!nat && !!params && !!situ && names.size > 0 && !avisQ.loading && !avisDept.loading && !sispea.loading, dd)
  const rows = useMemo(() => {
    if (!map) return [] as { c: string; row: MapRow }[]
    return Object.entries(map)
      .filter(([c]) => deptOfInsee(c) === dd)
      .map(([c, row]) => ({ c, row }))
  }, [map, dd])
  const withData = rows.filter((r) => r.row[0] > 0)

  // Un arrondissement de Paris, Marseille ou Lyon prend les données de sa commune (communeDeRattachement) : le
  // contrôle sanitaire ne connaît que la commune, et Paris paraissait « sans prélèvement ».
  const colorOf = useCallback(
    (p: Record<string, unknown>) => scale.color(valeurCommune(ind, map?.[communeDeRattachement(String(p.code))])),
    [map, ind, scale],
  )
  const labelOf = useCallback(
    (p: Record<string, unknown>) => infoBulleCommune(p, map, communeNames, y, (row) => etatCommune(ind, row, y)),
    [map, ind, y, communeNames],
  )

  if (!meta || !nat || !params) return <Chargement reserve />
  const name = names.get(dd) ?? dd
  const d = nat.depts[sise]?.[String(y)]
  const plv = d?.plv
  const pctBact = plv && plv.ne_bact ? 100 * (1 - plv.nc_bact / plv.ne_bact) : null
  const pctChim = plv && plv.ne_chim ? 100 * (1 - plv.nc_chim / plv.ne_chim) : null
  // Classées selon l'indicateur choisi ci-dessus : la liste doit montrer la même chose que la carte qu'elle accompagne.
  // Réseaux non conformes du département, au sens du bilan de chaque famille (lib/situations.ts). Toute
  // cette page compte des réseaux, comme la carte qu'elle porte : compter des communes reviendrait à
  // dire qu'une commune entière est touchée parce qu'une analyse a dépassé la limite.
  const parFamille = (f: FamilleSitu) => {
    const r = situ?.depts[dd]?.[f]
    return r ? { nc: nonConformes(r, f), tot: reseauxAnalyses(r) } : null
  }
  const rToutes = situ?.depts[dd]?.toutes
  const reseauxSitu = rToutes ? reseauxAnalyses(rToutes) : null
  const ncSitu = rToutes ? nonConformes(rToutes, 'toutes') : null
  const restrSitu = rToutes ? rToutes[2] : 0
  const pestSitu = parFamille('pesticides')
  const azoteSitu = parFamille('azote')
  // Communes ayant reçu un avis de l'ARS (colonne 14), seule liste de communes de la page.
  const ranking: CommuneListee[] = ind.key !== 'avis' ? [] : withData
    .filter((r) => (r.row[14] ?? 0) > 0)
    .sort((a, b) => (b.row[14] ?? 0) - (a.row[14] ?? 0) || b.row[0] - a.row[0])
    .slice(0, 15)
    .map(({ c, row }) => ({ insee: c, nom: communeNames.get(c) ?? c, plv: row[0], v: row[14] ?? 0 }))

  // Délégation « sans information » (règle du 24/09) : « aucun avis » n'y est jamais écrit.
  const muetAnnee = y != null && departementSansInformation(avisNat, dd, String(y))
  const consignes = reseauxConsignes(avisDept.data, String(y)) ?? { restriction: 0, ebullition: 0 }
  const avisCarte =
    muetAnnee && !(consignes.restriction + consignes.ebullition) ? null : { ...consignes, arret: avisNat?.arret?.[String(y)], lien: `?annee=${y}&vue=avis#familles` }

  const lignes: LigneSavoir[] = [
    {
      id: 'reseaux',
      titre: 'Les réseaux notés C ou D',
      aussi: ['bilan'],
      contenu: <ReseauxConcernes dept={dd} annee={y ?? ''} situ={situ} critere="classes" libelle="Notes A–D" />,
    },
    {
      id: 'familles',
      titre: 'Familles de paramètres et avis de l’ARS',
      // Un indicateur de famille ou d'avis venu de l'adresse (lienDepartement, retour de la carte) ouvre la ligne.
      ouvert: familleDemandee,
      contenu: (
        <>
        {/* Un département est un agrégat de réseaux : sa situation s'écrit en une phrase, au voyant du réseau le plus
            défavorable (PhraseAgregat) ; le jugement de chaque réseau reste sur sa fiche. */}
        {reseauxSitu != null && reseauxSitu > 0 && (
          <div className="cadre">
            <PhraseAgregat agg={{ n: reseauxSitu, nc: ncSitu ?? 0, restr: restrSitu }} suite={` en ${y}`} />
            <p className="cap">
              Le département compte {fmt.nb(reseauxSitu, 'réseau de distribution suivi', 'réseaux de distribution suivis')}. Chaque réseau est jugé selon la
              méthode du bilan officiel propre à chaque famille de paramètres
              {d ? `. Le contrôle sanitaire y a réalisé ${fmt.nb(plv!.n, 'prélèvement')} dans ${fmt.nb(rows.length, 'commune suivie', 'communes suivies')}` : ''}. <Link to="/methode#familles">Méthode</Link>.
            </p>
            <p className="cap">
              {PHRASE_ECART_NOTE} <Link to="/methode#grille-bacteriologique">Note de la bactériologie</Link>.
            </p>
          </div>
        )}

        {/* Voyant de l'état compté, devant le libellé (décision de l'auteur du 24/09) : aucun devant un compte nul, ni devant
            les dépassements de pesticides, qui réunissent des classes orange et la restriction, rouge (audit du 27/09). */}
        <div className="grid cols-4">
          <Kpi value={fmt.pct(pctBact, 1)} label="prélèvements conformes en bactériologie" ton={plv && plv.ne_bact > plv.nc_bact ? 'good' : undefined} sub={plv ? fmt.nb(plv.nc_bact, 'non conforme') : ''} />
          <Kpi value={fmt.pct(pctChim, 1)} label="prélèvements conformes en chimie" ton={plv && plv.ne_chim > plv.nc_chim ? 'good' : undefined} sub={plv ? fmt.nb(plv.nc_chim, 'non conforme') : ''} />
          <Kpi
            value={pestSitu ? `${fmt.int(pestSitu.nc)} / ${fmt.int(pestSitu.tot)}` : '–'}
            label="réseaux avec des dépassements de pesticides"
            sub={pestSitu ? `sur les ${fmt.int(pestSitu.tot)} réseaux où des pesticides ont été analysés` : ''}
          />
          <Kpi
            value={azoteSitu ? `${fmt.int(azoteSitu.nc)} / ${fmt.int(azoteSitu.tot)}` : '–'}
            label={`réseaux au-dessus de ${fmt.int(SEUILS_NITRATES[SEUILS_NITRATES.length - 1])} mg/L de nitrates`}
            ton={azoteSitu?.nc ? 'warn' : undefined}
            sub={azoteSitu ? `sur les ${fmt.int(azoteSitu.tot)} réseaux où les nitrates ont été analysés` : ''}
          />
        </div>

        <div className="toolbar">
          <h3>Communes</h3>
          <label>
            Indicateur{' '}
            <select value={indic} onChange={(e) => setIndic(e.target.value as IndicCommuneKey)}>
              {INDICS.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          {indicInconnu && <IndicInconnu affiche={ind.label} />}
          {ind.theme && (
            <Link to={`/themes/${ind.theme}`} className="btn">
              Voir le thème
            </Link>
          )}
        </div>
        <div className="grid cols-map">
          <div>
            <FranceMap
              data={communes}
              colorOf={colorOf}
              labelOf={labelOf}
              onClick={(p) => nav(`/commune/${communeDeRattachement(String(p.code))}`, { viewTransition: true })}
              onHover={(p) => setSurvol(p ? communeDeRattachement(String(p.code)) : null)}
              selected={survol}
              height={560}
              ariaLabel={`Carte des communes du département ${name} : ${ind.descCommune}, en ${y}. La liste placée à côté de la carte en donne une version textuelle.`}
            />
            <MapLegend
              desc={ind.descCommune}
              scale={scale}
              format={(v) => fmt.int(v)}
              cases={ind.kind === 'situation' ? legendeSituation(ind.fam!, y) : undefined}
              binaire={niveauxCommune(ind)}
              noDataLabel={ind.kind !== 'situation' && withData.some((r) => r.row[14] === null) ? `sans prélèvement ou ${AVIS_SANS_INFORMATION}` : 'sans prélèvement'}
            />
          </div>
          <div className="card">
            {ind.key !== 'avis' ? (
              // Des réseaux, pas des communes (choix de l'auteur, 24/09, règle du projet) ; les avis de l'ARS, qui visent
              // des communes, gardent leur liste de communes.
              <ReseauxConcernes dept={dd} annee={y ?? ''} situ={situ} critere={ind.kind === 'restriction' ? 'restriction' : ind.fam!} libelle={ind.label} />
            ) : (
            <>
            <h3>Communes ayant reçu un avis de l'ARS en {y}</h3>
            {ranking.length === 0 ? (
              <p className="muted">
                {deptMuet
                  ? phraseCarteSansInformation(String(y), avisNat?.lecture?.[dd]?.[String(y)]?.[0] ?? 0)
                  : `Aucune commune du département n'a reçu d'avis de l'ARS en ${y}.`}
              </p>
            ) : (
              <CommunesAvis
                communes={ranking}
                legende="Communes du département ayant reçu un avis de l'ARS, du plus grave au moins grave ; version textuelle de la carte"
                prelevements
                survol={survol}
                onSurvol={setSurvol}
              />
            )}
            </>
            )}
          </div>
        </div>
        </>
      ),
    },
    { id: 'evolution', titre: `L’évolution depuis ${anneesFiche(meta)[0]?.annee ?? ''}`.trim(), contenu: <EvolutionNotes meta={meta} dd={dd} /> },
    { id: 'ressource', titre: 'La ressource et les nappes', aussi: ['secheresse', 'nappes'], contenu: <DeptRessourceCard dd={dd} /> },
    { id: 'services', titre: 'Les services d’eau du département', aussi: ['amont'], contenu: <DeptServicesAmont dd={dd} /> },
    {
      id: 'hors-grille',
      titre: 'Substances sans limite de qualité',
      contenu: <DeptHorsGrille dd={dd} annee={String(y)} groupe={groupeHg(sp.get('groupe'))} />,
    },
    { id: 'pressions', titre: 'Les pressions sur la ressource', contenu: <DeptPressionCard dd={dd} /> },
    { id: 'carte', titre: 'La carte détaillée', vers: retourCarte },
    { id: 'methode', titre: 'Comment la note est calculée', vers: '/methode#classe-ars' },
    ...(signalementActif() ? [{ id: 'signaler', titre: 'Signaler une erreur sur cette page', contenu: <Signalement annee={y != null ? String(y) : undefined} /> }] : []),
  ]

  return (
    <div className="page fiche2 dept2">
      <Crumbs items={[{ label: 'La France', to: '/france' }, { label: name }]} />
      <div className="fiche-tete">
        <h1>{name}</h1>
        <p className="meta">Département {dd}</p>
      </div>

      {!pret || !comptes ? (
        <Chargement reserve />
      ) : (
        <div className="cartes-fiche">
          <CarteNotesAgregat
            annee={String(y)}
            c={comptes}
            chiffre="CD"
            legende="comptes"
            onglets={{ annees: anneesFiche(meta), onAnnee: setYear }}
            avis={avisCarte}
            muets={muetAnnee ? phraseCarteSansInformation(String(y), avisNat?.lecture?.[dd]?.[String(y)]?.[0] ?? 0) : null}
            carte={
              <div className="carte2-carte">
                <CarteClassesCommunes dept={dd} nomDept={name} annee={y} situ={situ} selection={survolBilan} onSurvol={setSurvolBilan} />
                <p className="carte2-note">
                  {PHRASE_CLASSE_C} Un clic sur une commune ouvre sa fiche ; la liste des réseaux notés C ou D figure plus bas.
                </p>
              </div>
            }
            note={
              familleDemandee && !indicInconnu ? (
                <p className="carte2-note">
                  L’indicateur « {ind.label} », demandé par le lien, figure dans <a href="#familles">Familles de paramètres et avis de l’ARS</a>.
                </p>
              ) : undefined
            }
          />
          <CarteSecheresseDepartement dd={dd} />
          <CartePrixAgregat nat={sispea.data} dd={dd} />
          <SavoirPlus lignes={lignes} />
        </div>
      )}
      <div className="source">
        Sources : contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, via data.gouv.fr), calcul du site ; services d’eau, observatoire SISPEA (OFB) ;
        restrictions sécheresse (VigiEau) ; nappes (ADES). Le site n’est pas une publication officielle : pour toute consigne sanitaire, la mairie et
        l’ARS font foi. <Link to="/methode#lexique">Les mots du site</Link>
      </div>
    </div>
  )
}

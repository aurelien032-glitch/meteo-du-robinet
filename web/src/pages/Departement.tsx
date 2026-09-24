import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import BarreAnnee from '../components/BarreAnnee'
import Crumbs from '../components/Crumbs'
import DeptRessourceCard from '../components/DeptRessourceCard'
import DeptPressionCard from '../components/DeptPressionCard'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import Tag from '../components/Tag'
import ToutDeplier from '../components/ToutDeplier'
import { departementSansInformation, phraseCarteSansInformation, toneAvis } from '../lib/avis'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { avisScale } from '../lib/scale'
import { phraseAgregat } from '../lib/service'
import { codeFamille, libellesCourts, libellesSituation, nonConformes, reseauxAnalyses, situationScale, type FamilleSitu, type SituationsFile } from '../lib/situations'
import {
  AVIS_PAR_CODE, AVIS_SANS_INFORMATION, deptOfInsee, libelleAvisCarte, siseOfDept,
  type AmontFile, type AvisNationalFile, type CommuneIndexEntry, type MapFile, type MapRow, type MetaFile, type NationalFile, type ParamsFile, type SispeaNationalFile,
} from '../lib/types'
import { useDensite } from '../lib/densite'
import { anneesFiche, useYear } from '../lib/year'
import { usePageTitle } from '../lib/title'
import Kpi from '../components/Kpi'

type IndicKey = 'pesticides' | 'azote' | 'pfas' | 'microbio' | 'any' | 'avis'
/**
 * La carte communale colore la SITUATION du réseau le plus défavorable qui dessert chaque commune, à la
 * manière des bilans officiels (revue du 2026-09-22), et non plus un binaire « dépassement ou non ».
 */
const INDICS: { key: IndicKey; label: string; col: number; theme: string | null; fam?: FamilleSitu }[] = [
  { key: 'pesticides', label: 'Pesticides', col: 5, theme: 'pesticides', fam: 'pesticides' },
  { key: 'azote', label: 'Nitrates', col: 6, theme: 'nitrates', fam: 'azote' },
  { key: 'pfas', label: 'PFAS', col: 7, theme: 'pfas', fam: 'pfas' },
  { key: 'microbio', label: 'Bactériologie', col: 8, theme: 'bacteries', fam: 'microbio' },
  { key: 'any', label: 'Toutes familles', col: 10, theme: null, fam: 'toutes' },
  { key: 'avis', label: "Avis de l'ARS", col: 14, theme: null },
]
const AVIS_NIVEAUX = ['aucun avis', 'publics sensibles', 'ébullition', 'restriction']
/** Code d'avis de la carte (MapRow[14]) → catégorie, pour le ton de l'étiquette (lib/avis.ts, toneAvis). */
const AVIS_CAT = { 1: 'sensibles', 2: 'ebullition', 3: 'interdiction' } as const
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Page département : conformité, communes touchées, carte des communes, service d'eau et amont. */
export default function Departement() {
  const { dd = '' } = useParams()
  const sise = siseOfDept(dd)
  const nav = useNavigate()
  const meta = useJson<MetaFile>('meta.json').data
  const [y, setYear] = useYear(meta)
  const [densite] = useDensite()
  const nat = useJson<NationalFile>('national.json').data
  const params = useJson<ParamsFile>('params.json').data
  const map = useJson<MapFile>(y ? `map/${y}.json` : null).data
  const communes = useJson<FeatureCollection>(`geo/communes/${dd}.json`).data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const sispea = useJson<SispeaNationalFile>('sispea/national.json').data
  const amont = useJson<AmontFile>('amont/national.json').data
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
  const indic = (INDICS.some((i) => i.key === indicUrl) ? indicUrl : 'pesticides') as IndicKey
  const setIndic = (v: IndicKey) => {
    const next = new URLSearchParams(sp)
    if (v === 'pesticides') next.delete('vue')
    else next.set('vue', v)
    setSp(next)
  }
  const retourCarte = useMemo(() => {
    const q = new URLSearchParams(sp)
    q.delete('vue') // propre à cette page ; la carte n'a pas cette clé
    q.set('dept', dd)
    return `/carte?${q.toString()}`
  }, [sp, dd])
  const ind = INDICS.find((i) => i.key === indic)!
  // Délégation « sans information » (avis.sans_information du pipeline) : lue pour l'indicateur des avis seulement.
  const avisNat = useJson<AvisNationalFile>(ind.key === 'avis' ? 'avis/national.json' : null).data
  const deptMuet = ind.key === 'avis' && y != null && departementSansInformation(avisNat, dd, String(y))
  const scale = ind.fam ? situationScale(ind.fam) : avisScale
  const communeNames = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const [survol, setSurvol] = useState<string | null>(null)
  usePageTitle(names.get(dd) ? `${names.get(dd)} · eau du robinet` : null, `Qualité de l'eau du robinet dans le département ${dd} : conformité, communes touchées, services d'eau, amont.`)

  const rows = useMemo(() => {
    if (!map) return [] as { c: string; row: MapRow }[]
    return Object.entries(map)
      .filter(([c]) => deptOfInsee(c) === dd)
      .map(([c, row]) => ({ c, row }))
  }, [map, dd])
  const withData = rows.filter((r) => r.row[0] > 0)

  const colorOf = useCallback(
    (p: Record<string, unknown>) => {
      const row = map?.[String(p.code)]
      if (!row || row[0] === 0) return scale.color(null)
      return scale.color(ind.fam ? codeFamille(row[15], ind.fam) : row[14] === undefined ? 0 : row[14])
    },
    [map, ind, scale],
  )
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const row = map?.[String(p.code)]
      if (!row || row[0] === 0) return `<b>${p.nom}</b><br>pas de prélèvement en ${y}`
      const v = ind.fam ? codeFamille(row[15], ind.fam) : null
      const etat = ind.fam ? (v == null ? 'famille non analysée' : libellesSituation(ind.fam)[v]) : libelleAvisCarte(row[14])
      return `<b>${p.nom}</b><br>${etat} · ${fmt.int(row[0])} prélèvements`
    },
    [map, ind, y],
  )

  if (!meta || !nat || !params) return <Chargement />
  const name = names.get(dd) ?? dd
  const d = nat.depts[sise]?.[String(y)]
  const plv = d?.plv
  const pctBact = plv && plv.ne_bact ? 100 * (1 - plv.nc_bact / plv.ne_bact) : null
  const pctChim = plv && plv.ne_chim ? 100 * (1 - plv.nc_chim / plv.ne_chim) : null
  // Millésime SISPEA : le millésime partagé s'il compte au moins cinq services renseignés, sinon le dernier qui les compte.
  const sispeaYears = sispea ? Object.keys(sispea.depts[dd] ?? {}).filter((a) => (sispea.depts[dd][a].prix.n ?? 0) >= 5).sort() : []
  const sy = sispeaYears.includes(String(y)) ? String(y) : sispeaYears[sispeaYears.length - 1]
  const sd = sy ? sispea?.depts[dd][sy] : undefined
  const cro = amont?.croisement.depts?.[dd]
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
  const ranking = [...withData]
    .filter((r) => ((r.row[ind.col] as number | undefined) ?? 0) > 0)
    .sort((a, b) => ((b.row[ind.col] as number | undefined) ?? 0) - ((a.row[ind.col] as number | undefined) ?? 0) || b.row[0] - a.row[0])
    .slice(0, 15)

  return (
    <div className="page">
      <Crumbs items={[{ label: name }]} />
      <div className="page-head">
        <div>
          <p className="kind">Département</p>
          <h1>{name}</h1>
          <p className="meta">Département {dd}</p>
        </div>
        <Link to={retourCarte} className="btn" viewTransition>
          Carte de France
        </Link>
      </div>
      {/* L'année au-dessus de tout ce qu'elle gouverne (règle de l'auteur, 23/09). */}
      <BarreAnnee
        titre="Bilan de l’année"
        note="Les chiffres, la carte des communes et leur classement suivent l’année choisie."
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setYear}
      />

      {/* Un département est un agrégat de réseaux : sa situation s'écrit en une phrase grise, sans voyant ni jauge
          (grammaire du 23/09) ; la couleur de jugement reste à chaque réseau, sur sa fiche. */}
      {reseauxSitu != null && reseauxSitu > 0 && (
        <div className="cadre">
          <p className="agg">
            {phraseAgregat({ n: reseauxSitu, nc: ncSitu ?? 0, restr: restrSitu })} en {y}.
          </p>
          <p className="cap">
            {fmt.nb(reseauxSitu, 'réseau de distribution suivi', 'réseaux de distribution suivis')}, chacun jugé selon le bilan officiel de chaque famille
            {d ? ` ; ${fmt.nb(plv!.n, 'prélèvement')} dans ${fmt.nb(rows.length, 'commune suivie', 'communes suivies')}` : ''}. <Link to="/methode">Comment c’est établi</Link>.
          </p>
        </div>
      )}

      <div className="grid cols-4">
        <Kpi value={fmt.pct(pctBact, 1)} label="prélèvements conformes en bactériologie" ton="good" sub={plv ? `${fmt.int(plv.nc_bact)} non conformes` : ''} />
        <Kpi value={fmt.pct(pctChim, 1)} label="prélèvements conformes en chimie" ton="good" sub={plv ? `${fmt.int(plv.nc_chim)} non conformes` : ''} />
        <Kpi
          value={pestSitu ? `${fmt.int(pestSitu.nc)} / ${fmt.int(pestSitu.tot)}` : '–'}
          label="réseaux avec des dépassements de pesticides"
          ton="warn"
          sub={pestSitu ? `sur les ${fmt.int(pestSitu.tot)} réseaux où des pesticides ont été analysés` : ''}
        />
        <Kpi
          value={azoteSitu ? `${fmt.int(azoteSitu.nc)} / ${fmt.int(azoteSitu.tot)}` : '–'}
          label="réseaux au-dessus de 50 mg/L de nitrates"
          ton="warn"
          sub={azoteSitu ? `sur les ${fmt.int(azoteSitu.tot)} réseaux où les nitrates ont été analysés` : ''}
        />
      </div>

      <div className="toolbar">
        <h2>Communes</h2>
        <label>
          Indicateur{' '}
          <select value={indic} onChange={(e) => setIndic(e.target.value as IndicKey)}>
            {INDICS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
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
            onClick={(p) => nav(`/commune/${p.code}`, { viewTransition: true })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={560}
            ariaLabel={`Carte des communes du département ${name} : ${ind.fam ? `situation ${ind.label.toLowerCase()}` : "avis sanitaire de l'ARS"} en ${y} ; le classement à côté reprend les valeurs`}
          />
          <MapLegend
            desc={ind.fam ? `situation ${ind.label.toLowerCase()} du réseau le plus défavorable qui dessert la commune` : "avis sanitaire de l'ARS le plus grave de l'année"}
            scale={scale}
            format={(v) => fmt.int(v)}
            binaire={ind.fam ? libellesSituation(ind.fam) : AVIS_NIVEAUX}
            noDataLabel={!ind.fam && withData.some((r) => r.row[14] === null) ? `sans prélèvement ou ${AVIS_SANS_INFORMATION}` : 'sans prélèvement'}
          />
        </div>
        <div className="card">
          <h3>Communes les plus touchées en {y}</h3>
          {ranking.length === 0 ? (
            <p className="muted">
              {deptMuet
                ? phraseCarteSansInformation(String(y), avisNat?.lecture?.[dd]?.[String(y)]?.[0] ?? 0)
                : `Aucune commune du département n'est concernée par « ${ind.label.toLowerCase()} » en ${y}.`}
            </p>
          ) : (
            <div className="table-scroll"><table className="data">
              <caption className="sr-only">Communes du département classées par nombre de dépassements pour l'indicateur choisi ; version textuelle de la carte</caption>
              <thead>
                <tr>
                  <th>Commune</th>
                  {ind.fam && <th>Situation</th>}
                  <th className="num">{ind.fam ? 'Dépassements' : 'Avis'}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(({ c, row }) => (
                  <tr key={c} className={survol === c ? 'on' : undefined} onMouseEnter={() => setSurvol(c)} onMouseLeave={() => setSurvol(null)}>
                    <td>
                      <Link to={`/commune/${c}`}>{communeNames.get(c) ?? c}</Link>
                      <span className="muted"> · {fmt.int(row[0])} prélèvements</span>
                    </td>
                    {ind.fam && (
                      <td className="nowrap">
                        <span className="swatch" style={{ background: scale.color(codeFamille(row[15], ind.fam)) }} aria-hidden="true" />{' '}
                        {codeFamille(row[15], ind.fam) != null ? libellesCourts(ind.fam)[codeFamille(row[15], ind.fam)!] : '–'}
                      </td>
                    )}
                    <td className="num">
                      {ind.key === 'avis' ? (
                        <Tag ton={toneAvis(AVIS_CAT[(row[14] ?? 1) as 1 | 2 | 3] ?? 'sensibles')}>{majuscule(AVIS_PAR_CODE[row[14] ?? 0])}</Tag>
                      ) : (
                        fmt.int(row[ind.col] as number)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <ToutDeplier />
      <Section key={`ressource-${densite}`} id="ressource" titre="La ressource du département" resume="Restrictions sécheresse depuis 2012, état des nappes" ouvert={densite === 'detaille'}>
        <DeptRessourceCard dd={dd} />
      </Section>
      <Section key={`pressions-${densite}`} id="pressions" titre="Les pressions sur la ressource" resume="Ventes de pesticides, prélèvements, assainissement" ouvert={densite === 'detaille'}>
        <DeptPressionCard dd={dd} />
      </Section>
      <Section key={`services-${densite}`} id="services" titre="Les services d'eau et l'amont" resume="Prix du m³, rendement, origine de l'eau distribuée" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Services d'eau du département {sy ? `· ${sy}` : ''}</h2>
          {!sd ? (
            <p className="muted">Pas d'indicateurs SISPEA publiés.</p>
          ) : (
            <div className="table-scroll"><table className="data">
              <tbody>
                <tr>
                  <td>Prix moyen pondéré du m³</td>
                  <td className="num">
                    <b>{fmt.dec(sd.prix.pond, 2)} €</b> <span className="muted">médiane {fmt.dec(sd.prix.p50, 2)} €, {sd.prix.n} services</span>
                  </td>
                </tr>
                <tr>
                  <td>Rendement pondéré du réseau</td>
                  <td className="num">
                    <b>{fmt.pct(sd.rend.pond, 1)}</b>
                  </td>
                </tr>
                <tr>
                  <td>Renouvellement annuel médian</td>
                  <td className="num">
                    <b>{fmt.dec(sd.renouv.p50, 2)} %</b>
                  </td>
                </tr>
                <tr>
                  <td>Population en délégation privée</td>
                  <td className="num">
                    <b>{fmt.pct(sd.part_pop_delegation == null ? null : 100 * sd.part_pop_delegation, 0)}</b>
                  </td>
                </tr>
              </tbody>
            </table></div>
          )}
          <div className="source">
            Source : SISPEA (OFB). <Link to="/services">Comparer les départements</Link>.
          </div>
        </div>
        <div className="card">
          <h2>L'amont</h2>
          {!cro ? (
            <p className="muted">Pas de données amont pour ce département.</p>
          ) : (
            <div className="table-scroll"><table className="data">
              <tbody>
                <tr>
                  <td>Eau potable prélevée en nappe</td>
                  <td className="num">
                    <b>{fmt.pct(cro.aep_part_sout == null ? null : 100 * cro.aep_part_sout, 0)}</b> <span className="muted">{fmt.int((cro.aep_volume ?? 0) / 1e6)} millions de m³</span>
                  </td>
                </tr>
                <tr>
                  <td>Substances phytopharmaceutiques vendues ({amont?.bnvd.annee_ref})</td>
                  <td className="num">
                    <b>{fmt.int((cro.ventes_kg ?? 0) / 1000)} t</b>
                  </td>
                </tr>
                <tr>
                  <td>Points de nappe au-dessus de 50 mg/L de nitrates</td>
                  <td className="num">
                    <b>
                      {cro.nappes_nitrates_sup50 ?? 0} / {cro.nappes_nitrates_n ?? 0}
                    </b>
                  </td>
                </tr>
                <tr>
                  <td>Points de nappe au-dessus de 0,5 µg/L de pesticides</td>
                  <td className="num">
                    <b>
                      {cro.nappes_pesticides_sup ?? 0} / {cro.nappes_pesticides_n ?? 0}
                    </b>
                  </td>
                </tr>
              </tbody>
            </table></div>
          )}
          <div className="source">
            Sources : BNPE, BNV-D, ADES via Hub'Eau. <Link to="/amont">Voir l'amont en France</Link>.
          </div>
        </div>
      </div>
      </Section>
    </div>
  )
}

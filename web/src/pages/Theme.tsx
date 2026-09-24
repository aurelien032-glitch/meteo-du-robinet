import BarreAnnee from '../components/BarreAnnee'
import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import Chart, { axisDefaults, partielItemStyle } from '../components/Chart'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MonthlySeries from '../components/MonthlySeries'
import Section from '../components/Section'
import ToutDeplier from '../components/ToutDeplier'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { pctCarte } from '../lib/carte'
import { ardoiseScale } from '../lib/scale'
import { classesNonConformes, couleursSituation, detail, detailSituation, familleDuTheme, libellesSituation, nbClasses, nonConformes, partNonConformes, type Repartition, type SituationsFile } from '../lib/situations'
import MapLegend from '../components/MapLegend'
import { deptCode, yearLabel, type MetaFile, type ParamsFile, type SeriesIndexEntry, type ThemeFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { anneesFiche, useYear } from '../lib/year'
import { usePageTitle } from '../lib/title'
import Kpi from '../components/Kpi'

export default function Theme() {
  const cle = useCleTheme()
  const { slug = '' } = useParams()
  const th = useJson<ThemeFile>(`themes/${slug}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const deps = useJson<FeatureCollection>('geo/departements.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const t = th.data
  const years = t ? Object.keys(t.national).sort() : []
  const [shared, setYear] = useYear(meta)
  const [densite] = useDensite()
  const preferred = String(shared ?? '')
  const last = years.includes(preferred) ? preferred : years[years.length - 1]
  // Paramètre de la série mensuelle : dans l'URL (?param=), parmi les séries de la famille du thème.
  const [survol, setSurvol] = useState<string | null>(null)
  const [sp, setSp] = useSearchParams()
  const seriesIndex = useJson<SeriesIndexEntry[]>('series/index.json').data
  const choix = useMemo(() => (seriesIndex ?? []).filter((e) => t && (e.f === t.famille || e.code === t.param_cle)), [seriesIndex, t])
  const paramUrl = sp.get('param')
  const param = paramUrl && choix.some((e) => e.code === paramUrl) ? paramUrl : (t?.param_cle ?? '')
  const setParam = (code: string) => {
    const next = new URLSearchParams(sp)
    if (code === t?.param_cle) next.delete('param')
    else next.set('param', code)
    setSp(next, { replace: true })
  }
  usePageTitle(t?.titre ?? null, t?.question ?? null)
  const nav = useNavigate()

  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps])
  // Situations des réseaux, à la manière des bilans du ministère de la Santé (décision de l'auteur,
  // 2026-09-22) : part des réseaux non conformes, et leur répartition par durée de dépassement. La
  // radioactivité, sans limite de qualité, garde le dénombrement des réseaux du thème.
  const fam = t ? familleDuTheme(t.famille) : null
  const situ = useJson<SituationsFile>(fam && last ? `situations/${last}.json` : null).data
  const serieSitu = useJson<Record<string, SituationsFile['national']>>(fam ? 'situations/national.json' : null).data
  const libelles = fam ? libellesSituation(fam) : []
  const deptShare = useMemo(() => {
    const m = new Map<string, { share: number; hit: number; n: number; r?: Repartition }>()
    if (!t || !last) return m
    if (fam) {
      for (const [d, par] of Object.entries(situ?.depts ?? {})) {
        const r = par[fam]
        const share = partNonConformes(r, fam)
        if (r && share != null && (deptName.size === 0 || deptName.has(d))) m.set(d, { share, hit: nonConformes(r, fam), n: r[0] + r[1] + r[2] + r[3], r })
      }
      return m
    }
    for (const [sise, byYear] of Object.entries(t.depts)) {
      const v = byYear[last]
      if (v && v.res_tot) m.set(deptCode(sise), { share: v.res_dep / v.res_tot, hit: v.res_dep, n: v.res_tot })
    }
    return m
  }, [t, last, fam, situ, deptName])
  const scale = useMemo(() => ardoiseScale(), [cle])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(deptShare.get(String(p.code))?.share ?? null), [deptShare, scale])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = deptShare.get(String(p.code))
      if (!v) return `<b>${p.nom}</b> (${p.code})<br>pas de donnée`
      const lignes = v.r && fam ? libelles.slice(0, nbClasses(fam)).map((l, i) => `${fmt.int(v.r![i])} ${l}`).join('<br>') : ''
      return `<b>${p.nom}</b> (${p.code})<br>${pctCarte(v.share)} des réseaux non conformes (${fmt.int(v.hit)} sur ${fmt.int(v.n)})${lignes ? `<br><span class="muted">${lignes}</span>` : ''}`
    },
    [deptShare, libelles, fam],
  )
  // Classement des réseaux : calculé par le pipeline sur la dernière année complète, quel que soit le
  // millésime affiché (revue du 2026-09-22 : le titre annonçait l'année choisie).
  const anneeRef = useMemo(() => {
    const complets = (meta?.annees ?? []).filter((a) => !(meta?.partiel ?? []).includes(a))
    return complets.length ? String(Math.max(...complets)) : last
  }, [meta, last])
  const periode = useMemo(() => {
    const a = meta?.annees ?? []
    if (!a.length) return ''
    const enCours = (meta?.partiel ?? []).length ? `, ${(meta?.partiel ?? []).join(', ')} en cours` : ''
    return `cumul ${Math.min(...a)}-${Math.max(...a)}${enCours}`
  }, [meta])

  const paramsOption = useMemo(() => {
    if (!t) return null
    const p = chartPalette()
    // Les sommes (« Total des pesticides analysés ») ne sont pas des substances : elles sortent du classement.
    const rows = t.params.filter((r) => r.nd > 0 && !/^(total|somme)\b/i.test(r.l ?? '')).slice(0, 12)
    const narrow = window.innerWidth < 700 // sur mobile, moins de place pour les libellés, qui sont tronqués
    const ax = axisDefaults()
    return {
      grid: { left: narrow ? 130 : 230, right: 60, top: 8, bottom: 44 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => `${fmt.int(Number(v))} analyses au-dessus de la limite` },
      xAxis: { type: 'value' as const, ...ax, name: 'analyses au-dessus de la limite', nameLocation: 'middle' as const, nameGap: 26, axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: (v: number) => fmt.int(v) } },
      yAxis: { type: 'category' as const, inverse: true, data: rows.map((r) => (r.l ?? r.p).slice(0, 38)), ...ax, axisLabel: { color: p.text, width: narrow ? 118 : 220, overflow: 'truncate' as const } },
      series: [{ type: 'bar' as const, name: 'Dépassements', data: rows.map((r) => r.nd), itemStyle: { color: p.mark, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 22, label: { show: true, position: 'right' as const, color: p.text, formatter: (x: { value: unknown }) => fmt.int(Number(x.value)) } }],
    }
  }, [t, cle])

  const yearsOption = useMemo(() => {
    if (!t || years.length < 2 || !fam || !serieSitu) return null
    const p = chartPalette()
    // Réseaux non conformes par situation, empilés (bilans du ministère) ; le millésime en cours est
    // estompé et hachuré : il est incomplet.
    const partiel = new Set(meta?.partiel ?? [])
    const couleurs = couleursSituation(fam)
    // Classes empilées : les classes non conformes, et pour les nitrates la classe proche de la limite (40-50).
    const classes = fam === 'azote' ? [2, 3] : classesNonConformes(fam)
    const item = (y: string, v: number | null | undefined, i: number) =>
      partiel.has(Number(y)) ? { value: v ?? null, itemStyle: { ...partielItemStyle(), color: couleurs[i] } } : (v ?? null)
    return {
      grid: { left: 60, right: 20, top: 40, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : `${fmt.int(Number(v))} réseaux`) },
      legend: { top: 0, type: 'scroll' as const, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: years.map((y) => yearLabel(meta, y)), ...axisDefaults() },
      yAxis: { type: 'value' as const, name: 'réseaux', ...axisDefaults(), axisLabel: { ...axisDefaults().axisLabel, formatter: (v: number) => fmt.int(v) } },
      series: classes.map((i) => ({
        type: 'bar' as const,
        stack: 'nc',
        name: libelles[i],
        data: years.map((y) => item(y, serieSitu[y]?.[fam]?.[i], i)),
        itemStyle: { color: couleurs[i] },
        barMaxWidth: 40,
      })),
    }
  }, [t, years, meta, fam, serieSitu, libelles, cle])

  // Constat sans issue → avec une issue (revue design du 2026-09-22, cf. NotFound.tsx).
  if (th.error)
    return (
      <div className="page">
        <p className="muted">Thème introuvable.</p>
        <Link to="/themes">Voir tous les thèmes →</Link>
      </div>
    )
  if (!t || !params) return <Chargement />
  const n = t.national[last]
  const key = params.params[t.param_cle]
  const ranking = [...deptShare.entries()].sort((a, b) => b[1].share - a[1].share || b[1].n - a[1].n).slice(0, 12)
  const rn = fam ? situ?.national[fam] : undefined

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: t.titre }]} />
      <h1>{t.titre}</h1>
      <p className="lead">{t.question}</p>
      <BarreAnnee
        titre="Année des données"
        note="Elle vaut pour les chiffres, la carte et les classements ci-dessous."
        annees={anneesFiche(meta, years)}
        annee={Number(last)}
        onChange={setYear}
      />

      <div className="grid cols-4">
        {/* Revue du 2026-09-22 (décision de l'auteur) : plus de « communes avec un dépassement », qui comptait
            une commune entière pour une seule analyse ; les réseaux et leurs situations, comme le ministère. */}
        {rn ? (
          <>
            <Kpi
              value={fmt.pct((100 * nonConformes(rn, fam!)) / Math.max(1, rn[0] + rn[1] + rn[2] + rn[3]), 1)}
              label={`des réseaux non conformes en ${yearLabel(meta, last)}`}
              sub={`${fmt.int(nonConformes(rn, fam!))} sur ${fmt.int(rn[0] + rn[1] + rn[2] + rn[3])} réseaux analysés`}
            />
            <Kpi value={fmt.int(detail(rn, fam!))} label={`réseaux : ${detailSituation(fam!).titre.toLowerCase()}`} sub={`sur ${fmt.int(rn[0] + rn[1] + rn[2] + rn[3])} réseaux analysés`} />
          </>
        ) : (
          <Kpi value={n.res_dep == null ? '–' : fmt.int(n.res_dep)} label="réseaux de distribution concernés" sub={n.res_tot == null ? '' : `sur ${fmt.int(n.res_tot)} réseaux analysés`} />
        )}
        <Kpi value={fmt.pct((100 * n.nd) / Math.max(1, n.n), 2)} label="des analyses au-dessus de la limite" sub={`${fmt.int(n.nd)} sur ${fmt.int(n.n)} analyses`} />
        <Kpi value={fmt.int(n.nq)} label="résultats quantifiés (détectés)" sub={`${fmt.pct((100 * n.nq) / Math.max(1, n.n), 1)} des analyses`} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Réseaux non conformes par département ({yearLabel(meta, last)})</h2>
          <FranceMap
            data={deps && (!fam || situ) ? deps : null}
            colorOf={colorOf}
            labelOf={labelOf}
            onClick={(p) => nav(`/departement/${p.code}`)}
            actionLabel="Ouvrir la fiche du département →"
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={480}
            ariaLabel="Carte des départements : part des réseaux de distribution non conformes ; classement à côté"
          />
          <MapLegend
            desc={fam === 'microbio' ? 'part des réseaux dont au moins un prélèvement n’est pas conforme en bactériologie' : 'part des réseaux de distribution avec au moins une analyse au-dessus de la limite de qualité dans l’année'}
            scale={scale}
            format={fmt.pctBorne}
          />
        </div>
        <div className="card">
          <h2>Départements les plus touchés</h2>
          <div className="table-scroll"><table className="data">
            <caption className="sr-only">Départements classés par part de réseaux non conformes ; version textuelle de la carte</caption>
            <thead>
              <tr>
                <th>Département</th>
                <th className="num wrap">
                  Non conformes <span className="unite">réseaux</span>
                </th>
                {fam && <th className="num wrap">{detailSituation(fam).titre}</th>}
                <th className="num">Part</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(([d, v]) => (
                <tr key={d} className={survol === d ? 'on' : undefined} onMouseEnter={() => setSurvol(d)} onMouseLeave={() => setSurvol(null)}>
                  <td>
                    <Link to={`/departement/${d}`}>{deptName.get(d) ?? d}</Link> <span className="muted">({d})</span>
                  </td>
                  <td className="num">
                    {fmt.int(v.hit)} / {fmt.int(v.n)}
                  </td>
                  {fam && <td className="num">{v.r ? fmt.int(detail(v.r, fam)) : '–'}</td>}
                  <td className="num">
                    <b>{pctCarte(v.share)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* La synthèse (KPI, carte, classement) tient au-dessus : graphiques et tableaux de détail repliés
          (audit du 2026-09-22), sur le modèle des fiches commune et département. */}
      <ToutDeplier />
      <Section key={`graphiques-${densite}`} id="graphiques" titre="Substances et évolution" resume="Ce qui dépasse le plus souvent, et l'évolution par millésime" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Substances le plus souvent au-dessus de la limite</h2>
          <p className="muted">Analyses au-dessus de la limite de qualité, {periode} ; hors sommes de substances.</p>
          {paramsOption && <Chart option={paramsOption} height={360} exportName={`substances-${slug}`} />}
        </div>
        {yearsOption && (
          <div className="card">
            <h2>Réseaux non conformes, par millésime</h2>
            <Chart option={yearsOption} height={360} exportName={`evolution-${slug}`} />
            <div className="source">Réseaux de distribution par situation de l'année, à la manière des bilans du ministère de la Santé (qui les pondèrent par la population desservie, non publiée). Le millésime en cours (barres hachurées) est incomplet : sa hauteur n'est pas comparable aux autres.</div>
          </div>
        )}
      </div>
      </Section>
      <Section key={`detail-${densite}`} id="detail" titre="Réseaux les plus touchés et suivi mensuel" resume="Classement des réseaux, et l'évolution mois par mois d'un paramètre" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Réseaux les plus touchés en {anneeRef}</h2>
          {last !== anneeRef && <p className="muted">Classement établi sur {anneeRef}, dernière année complète.</p>}
          {(
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th>Réseau</th>
                  <th>Dép.</th>
                  <th className="num">Communes</th>
                  <th className="num">Dépassements</th>
                  <th className="num">Max {key?.k ?? ''}</th>
                </tr>
              </thead>
              <tbody>
                {t.top_reseaux.slice(0, 12).map((r) => (
                  <tr key={r.r}>
                    <td>
                      {r.nom ?? r.r}
                      <div className="muted text-xs">
                        {r.dist}
                      </div>
                    </td>
                    <td>{deptCode(r.d)}</td>
                    <td className="num">{r.nc}</td>
                    <td className="num">
                      <b>{r.nd}</b>
                    </td>
                    <td className="num">
                      {fmt.dec(r.vmax, 2)} {key?.u ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Mois par mois</h2>
            {choix.length > 1 && (
              <label>
                Paramètre{' '}
                <select value={param} onChange={(e) => setParam(e.target.value)}>
                  {choix.map((e) => (
                    <option key={e.code} value={e.code}>
                      {e.k ?? e.l}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Link to={`/carte?indic=param&param=${param}&annee=${last}`} className="btn">
              Voir sur la carte
            </Link>
          </div>
          <MonthlySeries code={param} height={440} />
        </div>
      </div>
      </Section>
      <div className="source">
        Source : contrôle sanitaire SISE-Eaux, ministère chargé de la Santé. Paramètre de référence : {key?.l} ({key?.lim != null ? `limite de qualité ${fmt.seuil(key.lim)}` : key?.ref != null ? `référence de qualité ${fmt.seuil(key.ref)}, sans valeur réglementaire` : 'sans limite fixée'}).
      </div>
    </div>
  )
}

import BarreAnnee from '../components/BarreAnnee'
import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import Chart, { axisDefaults, etiquetterExtremes } from '../components/Chart'
import Crumbs from '../components/Crumbs'
import { usePageTitle } from '../lib/title'
import FranceMap from '../components/FranceMap'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { pctCarte } from '../lib/carte'
import { ardoiseScale, PALIERS_ARDOISE, stepScale } from '../lib/scale'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { useDensite } from '../lib/densite'
import type { AmontCroisementDept, AmontFile } from '../lib/types'
import Kpi from '../components/Kpi'

type IndicKey = 'ventes' | 'robinet' | 'nitrates' | 'pesticides_nappes' | 'rivieres_nitrates' | 'rivieres_pesticides' | 'sout'
/**
 * `paliers` : bornes rondes fixes (décision de l'auteur, 2026-09-22), calées sur la distribution
 * départementale. « Au robinet » : part des RÉSEAUX non conformes aux pesticides (au moins une analyse
 * au-dessus de la limite dans l'année), la mesure et les paliers des pages Carte et Thème.
 */
const INDICS: { key: IndicKey; label: string; unit: string; get: (d: AmontCroisementDept) => number | null; higherIsWorse: boolean | null; note?: string; paliers: number[] }[] = [
  { key: 'ventes', label: 'Substances phytopharmaceutiques vendues', unit: 't', get: (d) => (d.ventes_kg == null ? null : d.ventes_kg / 1000), higherIsWorse: true, note: 'total du département, non rapporté à sa surface agricole ; localisé au siège du distributeur', paliers: [0, 100, 250, 500, 1000, 2000, 3000] },
  { key: 'robinet', label: 'Réseaux non conformes aux pesticides au robinet', unit: '%', get: (d) => (d.robinet_part_reseaux == null ? null : 100 * d.robinet_part_reseaux), higherIsWorse: true, paliers: PALIERS_ARDOISE.map((x) => 100 * x) },
  { key: 'nitrates', label: 'Points de nappe au-dessus de 50 mg/L de nitrates', unit: '%', get: (d) => (d.nappes_nitrates_n ? (100 * (d.nappes_nitrates_sup50 ?? 0)) / d.nappes_nitrates_n : null), higherIsWorse: true, paliers: [0, 2, 5, 10, 20, 30] },
  { key: 'pesticides_nappes', label: 'Points de nappe au-dessus de 0,5 µg/L de pesticides', unit: '%', get: (d) => (d.nappes_pesticides_n ? (100 * (d.nappes_pesticides_sup ?? 0)) / d.nappes_pesticides_n : null), higherIsWorse: true, paliers: [0, 5, 10, 20, 40, 60] },
  { key: 'rivieres_nitrates', label: 'Stations de rivière au-dessus de 50 mg/L de nitrates', unit: '%', get: (d) => (d.rivieres_nitrates_n ? (100 * (d.rivieres_nitrates_sup ?? 0)) / d.rivieres_nitrates_n : null), higherIsWorse: true, paliers: [0, 2, 5, 10, 20, 30] },
  { key: 'rivieres_pesticides', label: 'Stations de rivière au-dessus de 5 µg/L de pesticides totaux', unit: '%', get: (d) => (d.rivieres_pesticides_n ? (100 * (d.rivieres_pesticides_sup ?? 0)) / d.rivieres_pesticides_n : null), higherIsWorse: true, paliers: [0, 1, 5, 10, 20, 30] },
  // Descriptif (ni bon ni mauvais) : rampe neutre.
  { key: 'sout', label: "Part de l'eau potable prélevée en nappe", unit: '%', get: (d) => (d.aep_part_sout == null ? null : 100 * d.aep_part_sout), higherIsWorse: null, paliers: [0, 20, 40, 60, 80] },
]

export default function Amont() {
  const cle = useCleTheme()
  const am = useJson<AmontFile>('amont/national.json').data
  const [densite] = useDensite()
  const deps = useJson<FeatureCollection>('geo/departements.json').data
  // Indicateur de la carte dans l'URL (?indic=), comme sur la carte principale.
  const [sp, setSp] = useSearchParams()
  const ind = INDICS.find((i) => i.key === sp.get('indic')) ?? INDICS[0]
  const setIndic = (k: IndicKey) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
  usePageTitle("L'amont du robinet", "Prélèvements pour l'eau potable, ventes de pesticides, état des nappes et des rivières, département par département.")
  const cro = am?.croisement.depts ?? {}
  const nav = useNavigate()
  const deptName = useMemo(() => {
    const m = new Map<string, string>()
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps])
  const deptVal = useMemo(() => {
    const m = new Map<string, number>()
    for (const [d, v] of Object.entries(cro)) {
      const x = ind.get(v)
      if (x != null) m.set(d, x)
    }
    return m
  }, [cro, ind])
  // Part de réseaux non conformes au robinet : rampe ardoise, comme l'accueil, la carte et les thèmes.
  const echelle = useMemo(
    () => (ind.key === 'robinet' ? ardoiseScale(100) : stepScale(ind.paliers, { invert: ind.higherIsWorse === false })),
    [ind, cle],
  )
  const colorOf = useCallback((p: Record<string, unknown>) => echelle.color(deptVal.get(String(p.code)) ?? null), [deptVal, echelle])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = deptVal.get(String(p.code))
      if (v == null) return `<b>${p.nom}</b> (${p.code})<br>pas de donnée`
      return `<b>${p.nom}</b> (${p.code})<br>${ind.key === 'robinet' ? pctCarte(v / 100) : `${ind.unit === 't' ? fmt.int(v) : fmt.dec(v, 1)} ${ind.unit}`}`
    },
    [deptVal, ind],
  )

  const scatterOption = useMemo(() => {
    if (!am) return null
    const p = chartPalette()
    const pts = etiquetterExtremes(
      Object.entries(cro)
        .filter(([, v]) => v.ventes_kg != null && v.robinet_part_reseaux != null)
        .map(([d, v]) => ({ name: deptName.get(d) ?? d, value: [v.ventes_kg! / 1000, 100 * v.robinet_part_reseaux!, d] })),
      5,
    )
    return {
      grid: { left: 60, right: 30, top: 30, bottom: 50 },
      tooltip: {
        trigger: 'item' as const,
        formatter: (o: unknown) => {
          const p = o as { name?: string; value?: number[] }
          const v = p.value ?? []
          return `<b>${p.name ?? ''}</b><br>${fmt.int(v[0])} t vendues · ${fmt.pct(v[1], 0)} des réseaux non conformes aux pesticides`
        },
      },
      xAxis: { type: 'log' as const, name: 'tonnes de substances vendues (log)', nameLocation: 'middle' as const, nameGap: 30, ...axisDefaults() },
      yAxis: { type: 'value' as const, name: '% réseaux non conformes', max: 100, ...axisDefaults() },
      series: [
        {
          type: 'scatter' as const,
          labelLayout: { hideOverlap: true },
          data: pts,
          symbolSize: 9,
          itemStyle: { color: p.mark, opacity: 0.75 },
          label: { show: false, position: 'right' as const, color: p.muted, fontSize: p.fontSize * 0.85, formatter: (o: { value?: unknown }) => String((o.value as unknown[])[2]) },
        },
      ],
    }
  }, [am, cro, deptName, cle])

  if (!am) return <Chargement />
  // Millésime commun aux deux sources (BNPE, BNV-D), qui ont chacune leur propre calendrier et 16/7 ans
  // d'historique inexploité jusqu'ici (revue design du 2026-09-22 : la page n'affichait que la dernière
  // année de chacune, sans aucun moyen de consulter les précédentes). Intersection plutôt que deux
  // sélecteurs séparés : la question posée par la page est « où en est-on », pas « BNPE de quelle année ».
  const anneesCommunes = Object.keys(am.bnpe.annees ?? {})
    .filter((a) => am.bnvd.annees?.[a])
    .sort()
  const anneeUrl = sp.get('annee')
  const annee = anneesCommunes.includes(anneeUrl ?? '') ? anneeUrl! : anneesCommunes[anneesCommunes.length - 1]
  const setAnnee = (a: string) => {
    const next = new URLSearchParams(sp)
    if (a === anneesCommunes[anneesCommunes.length - 1]) next.delete('annee')
    else next.set('annee', a)
    setSp(next, { replace: true })
  }
  const bnpeY = am.bnpe.annees?.[annee]
  const bnvdY = am.bnvd.annees?.[annee]
  const nit = am.ades.nitrates
  const pest = am.ades.pesticides
  const ranking = [...deptVal.entries()].sort((a, b) => (ind.higherIsWorse === false ? a[1] - b[1] : b[1] - a[1]))

  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre', to: '/themes' }, { label: "L'amont du robinet" }]} />
      <h1>L'amont du robinet</h1>
      <p className="lead">D'où vient l'eau potable, dans quel état sont les nappes qui l'alimentent, et ce qui est épandu au-dessus.</p>

      {/* Millésime scopé aux deux seuls chiffres qu'il fait varier (BNPE, BNV-D ont un historique ; la
          carte et le reste de la page sont une situation fixe, cf. plus bas) : un sélecteur dans le
          toolbar de page aurait laissé croire qu'il pilote toute la page (revue design du 2026-09-22). */}
      <BarreAnnee
        titre="Prélèvements et ventes"
        titreSection
        note="L’année vaut pour ces chiffres ; la carte et la suite de la page montrent la situation la plus récente."
        annees={anneesCommunes.map((a) => ({ annee: Number(a), enCours: false, sansDonnees: false }))}
        annee={Number(annee)}
        onChange={(a) => setAnnee(String(a))}
      />
      <div className="grid cols-4">
        <Kpi
          value={bnpeY?.volume != null ? `${fmt.dec(bnpeY.volume / 1e9, 2)} Md m³` : '–'}
          label={`prélevés pour l'eau potable en ${annee}`}
          sub={bnpeY ? `${fmt.int(bnpeY.n_ouvrages)} ouvrages · ${fmt.pct(bnpeY.volume && bnpeY.sout != null ? (100 * bnpeY.sout) / bnpeY.volume : null, 0)} en nappe` : ''}
        />
        <Kpi
          value={bnvdY?.kg != null ? `${fmt.int(bnvdY.kg / 1000)} t` : '–'}
          label={`de substances phytopharmaceutiques vendues en ${annee}`}
          sub={bnvdY ? `${fmt.int((bnvdY.herbicides ?? 0) / 1000)} t d'herbicides, ${fmt.int((bnvdY.fongicides ?? 0) / 1000)} t de fongicides` : 'ventes BNV-D en cours de collecte'}
        />
        <Kpi
          value={nit ? fmt.pct((100 * nit.sup_seuil) / Math.max(1, nit.n_points), 0) : '–'}
          label="des points de nappe suivis ont dépassé 50 mg/L de nitrates depuis 2020"
          sub={nit ? `${fmt.int(nit.n_points)} points · ${fmt.int(nit.aep_sup_seuil)} captages d'eau potable concernés` : ''}
        />
        <Kpi
          value={pest ? fmt.pct((100 * pest.sup_seuil) / Math.max(1, pest.n_points), 0) : '–'}
          label="des points de nappe ont dépassé 0,5 µg/L de pesticides totaux"
          sub={pest ? `${fmt.int(pest.n_points)} points suivis · ${fmt.int(pest.aep_sup_seuil)} captages concernés` : ''}
        />
      </div>

      {am.rivieres && (am.rivieres.nitrates || am.rivieres.pesticides) && (
        <div className="grid cols-2">
          {am.rivieres.nitrates && (
            <Kpi
              value={fmt.pct((100 * am.rivieres.nitrates.sup_seuil) / Math.max(1, am.rivieres.nitrates.n_stations), 0)}
              label="des stations de rivière ont dépassé 50 mg/L de nitrates depuis 2020"
              sub={`${fmt.int(am.rivieres.nitrates.n_stations)} stations · ${fmt.pct((100 * am.rivieres.nitrates.sup_demi) / Math.max(1, am.rivieres.nitrates.n_stations), 0)} au-dessus de 25 mg/L`}
            />
          )}
          {am.rivieres.pesticides && (
            <Kpi
              value={fmt.pct((100 * am.rivieres.pesticides.sup_seuil) / Math.max(1, am.rivieres.pesticides.n_stations), 0)}
              label="des stations de rivière ont dépassé 5 µg/L de pesticides totaux, seuil des eaux brutes potabilisables"
              sub={`${fmt.int(am.rivieres.pesticides.n_stations)} stations · ${fmt.pct((100 * am.rivieres.pesticides.sup_demi) / Math.max(1, am.rivieres.pesticides.n_stations), 0)} au-dessus de 0,5 µg/L`}
            />
          )}
        </div>
      )}
      {/* Détail replié (audit du 2026-09-22) : les KPI répondent déjà à l'essentiel, la carte « par
          département » juste en dessous reste le second temps fort de la page, visible d'emblée. */}
      <Section key={`ventes-${densite}`} id="ventes" titre="Ventes de pesticides et corrélation au robinet" resume="Nuage de points par département, et les substances les plus vendues" ouvert={densite === 'detaille'}>
      <div className="grid cols-2">
        <div className="card">
          <h2>Pesticides vendus, pesticides au robinet</h2>
          <p className="muted">Chaque point est un département : ventes de substances en {am.bnvd.annee_ref ?? '–'} contre part des réseaux avec un dépassement au robinet en {am.croisement.annee_robinet ?? '–'}.</p>
          {scatterOption && <Chart option={scatterOption} height={380} exportName="ventes-vs-robinet" />}
          <div className="source">
            Étiquetés : les cinq départements les plus hauts sur chaque axe. Un lien entre les deux ne prouve pas une cause : ventes et dépassements dépendent aussi
            de la surface agricole, de l'origine de l'eau et de la densité du contrôle.
          </div>
        </div>
        <div className="card">
          <h2>Substances les plus vendues ({am.bnvd.annee_ref ?? '–'})</h2>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th>Substance</th>
                <th>Fonction</th>
                <th className="num">Tonnes</th>
              </tr>
            </thead>
            <tbody>
              {(am.bnvd.top_substances ?? []).slice(0, 14).map((s) => (
                <tr key={s.s}>
                  <td>{s.s}</td>
                  <td className="muted">{s.f}</td>
                  <td className="num">{fmt.int((s.kg ?? 0) / 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
      </Section>

      <div className="toolbar">
        <h2>Par département</h2>
        <label>
          Indicateur{' '}
          <select value={ind.key} onChange={(e) => setIndic(e.target.value as IndicKey)}>
            {INDICS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            onClick={(p) => nav(`/departement/${p.code}`)}
            actionLabel="Ouvrir la fiche du département →"
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={560}
            ariaLabel={`${ind.label} par département`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit})${ind.note ? `, ${ind.note}` : ''}`} scale={echelle} format={(v) => (ind.unit === 't' ? fmt.int(v) : fmt.dec(v, 0))} />
        </div>
        <div className="card">
          <h3>{ind.label}</h3>
          <div className="table-scroll"><table className="data">
            <caption className="sr-only">Départements classés selon l'indicateur choisi ; version textuelle de la carte</caption>
            <tbody>
              {ranking.slice(0, 14).map(([d, v]) => (
                <tr key={d} className={survol === d ? 'on' : undefined} onMouseEnter={() => setSurvol(d)} onMouseLeave={() => setSurvol(null)}>
                  <td>
                    <Link to={`/departement/${d}`}>{deptName.get(d) ?? d}</Link> <span className="muted">({d})</span>
                  </td>
                  <td className="num">
                    <b>{fmt.dec(v, 1)}</b> {ind.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="source">
        Sources : BNPE, volumes prélevés (OFB, Hub'Eau) ; BNV-D, ventes de substances par département du siège du distributeur (OFB, Hub'Eau) ; ADES,
        qualité des eaux souterraines (BRGM, Hub'Eau) ; contrôle sanitaire SISE-Eaux. Les ventes sont localisées au point de vente, pas au champ.
      </div>
    </div>
  )
}

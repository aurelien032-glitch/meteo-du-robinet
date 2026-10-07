import { useCallback, useMemo } from 'react'
import Chargement from '../components/Chargement'
import type { JSX } from 'react'
import Chart, { axisDefaults, etiquetterExtremes, lineDefaults, partielItemStyle } from '../components/Chart'
import MapLegend from '../components/MapLegend'
import FranceMap from '../components/FranceMap'
import MonthlySeries from '../components/MonthlySeries'
import VigiEauMap from '../components/VigiEauMap'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { chartPalette, useCleTheme } from '../lib/theme'
import { qualiteScale } from '../lib/scale'
import { anneesSispea, serieMedianes } from '../lib/sispea'
import { deptCode, type AmontFile, type MetaFile, type SispeaNationalFile, type ThemeFile } from '../lib/types'
import Kpi from '../components/Kpi'
import ids from './ids.json'

/** Une scène = une idée, un écran 16:9, une source. Exportées en série par scripts/export-scenes.mjs. */
export interface SceneDef {
  id: string
  titre: string
  sousTitre: string
  source: string
  Component: () => JSX.Element
}

function completeYears(meta: MetaFile | null): string[] {
  return (meta?.annees ?? []).filter((a) => !(meta?.partiel ?? []).includes(a)).map(String)
}

function PesticidesEffacement() {
  const cle = useCleTheme()
  const t = useJson<ThemeFile>('themes/pesticides.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const option = useMemo(() => {
    if (!t) return null
    const p = chartPalette()
    const years = Object.keys(t.national).sort()
    return {
      grid: { left: 80, right: 40, top: 60, bottom: 50 },
      xAxis: { type: 'category' as const, data: years.map((y) => ((meta?.partiel ?? []).includes(Number(y)) ? `${y} (en cours)` : y)), ...axisDefaults(), axisLabel: { color: p.text, fontSize: p.fontSize } },
      yAxis: { type: 'value' as const, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize * 0.85 } },
      series: [{ type: 'bar' as const, data: years.map((y) => ((meta?.partiel ?? []).includes(Number(y)) ? { value: t.national[y].res_dep ?? null, itemStyle: partielItemStyle() } : (t.national[y].res_dep ?? null))), itemStyle: { color: p.alerte, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 140, label: { show: true, position: 'top' as const, color: p.text, fontSize: p.fontSize * 1.4, fontWeight: 'bold' as const, formatter: (o: { value?: unknown }) => fmt.int(Number(o.value)) } }],
    }
  }, [t, meta, cle])
  if (!option) return <Chargement />
  return <Chart option={option} height={780} exportName="scene-pesticides-effacement" />
}

function PfasDepistage() {
  const cle = useCleTheme()
  const t = useJson<ThemeFile>('themes/pfas.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const option = useMemo(() => {
    if (!t) return null
    const p = chartPalette()
    const years = completeYears(meta).filter((y) => t.national[y])
    return {
      grid: { left: 90, right: 40, top: 60, bottom: 50 },
      legend: { top: 0, type: 'scroll' as const, textStyle: { color: p.text, fontSize: p.fontSize } },
      xAxis: { type: 'category' as const, data: years, ...axisDefaults(), axisLabel: { color: p.text, fontSize: p.fontSize } },
      // Échelle linéaire : sur une échelle log, la longueur d'une barre ne dit plus rien de la quantité.
      yAxis: { type: 'value' as const, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize * 0.85 } },
      series: [
        { type: 'bar' as const, name: 'réseaux analysés', data: years.map((y) => t.national[y].res_tot ?? 0), itemStyle: { color: p.series[0] }, barMaxWidth: 110, label: { show: true, position: 'top' as const, color: p.text, fontSize: p.fontSize * 1.2, formatter: (o: { value?: unknown }) => fmt.int(Number(o.value)) } },
        { type: 'bar' as const, name: 'réseaux au-dessus de 0,1 µg/L', data: years.map((y) => t.national[y].res_dep ?? 0), itemStyle: { color: p.alerte }, barMaxWidth: 110, label: { show: true, position: 'top' as const, color: p.text, fontSize: p.fontSize * 1.2, formatter: (o: { value?: unknown }) => fmt.int(Number(o.value)) } },
      ],
    }
  }, [t, meta, cle])
  if (!option) return <Chargement />
  return <Chart option={option} height={780} exportName="scene-pfas" />
}

function PrixFuites() {
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const years = anneesSispea(nat)
  const y = years[years.length - 1]
  if (!nat || !y) return <Chargement />
  const v = nat.annees[y]
  const g = nat.gestion[y] ?? {}
  const popTot = (g.regie?.pop ?? 0) + (g.delegation?.pop ?? 0)
  return (
    <div className="grid cols-2">
      <Kpi value={`${fmt.dec(v.prix.pond, 2)} €`} label={`le m³ d'eau potable en ${y}, prix moyen pondéré`} sub={`de ${fmt.dec(v.prix.p10, 2)} à ${fmt.dec(v.prix.p90, 2)} € selon les services`} />
      <Kpi value={fmt.pct(v.pertes_vol ?? null, 1)} label="de l'eau mise en distribution est perdue en fuites" sub="volumes déclarés : eau mise en distribution moins eau consommée" />
      <Kpi value={`${fmt.int(v.renouv.p50 ? 100 / v.renouv.p50 : null)} ans`} label="pour renouveler tout le réseau au rythme médian" sub={`${fmt.dec(v.renouv.p50, 2)} % renouvelés par an`} />
      <Kpi value={fmt.pct(popTot ? (100 * (g.delegation?.pop ?? 0)) / popTot : null, 0)} label="des habitants relèvent d'un service en gestion déléguée" sub={`prix médian ${fmt.dec(g.delegation?.prix.p50, 2)} € contre ${fmt.dec(g.regie?.prix.p50, 2)} € en régie`} />
    </div>
  )
}

function PrixDepuis2008() {
  const cle = useCleTheme()
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const option = useMemo(() => {
    if (!nat) return null
    const p = chartPalette()
    const { years, prix } = serieMedianes(nat)
    // Valeurs affichées au premier et au dernier point seulement : l'écart se lit, la courbe reste lisible.
    const iPremier = prix.findIndex((v) => v != null)
    const iDernier = prix.length - 1 - [...prix].reverse().findIndex((v) => v != null)
    const data = prix.map((v, i) => (i === iPremier || i === iDernier ? { value: v, label: { show: true } } : v))
    return {
      grid: { left: 80, right: 40, top: 30, bottom: 50 },
      xAxis: { type: 'category' as const, data: years, ...axisDefaults(), axisLabel: { color: p.text, fontSize: p.fontSize } },
      yAxis: { type: 'value' as const, name: '€ / m³', scale: true, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize * 0.85 } },
      series: [{ type: 'line' as const, data, ...lineDefaults(p.series[0]), symbolSize: 10, lineStyle: { width: 4, color: p.series[0] }, label: { show: false, position: 'top' as const, color: p.text, fontSize: p.fontSize * 1.1, fontWeight: 'bold' as const, formatter: (o: { value?: unknown }) => (o.value == null ? '' : fmt.dec(Number(o.value), 2)) } }],
    }
  }, [nat, cle])
  if (!option) return <Chargement />
  return <Chart option={option} height={780} exportName="scene-prix-2008" />
}

function NitratesNappeRobinet() {
  const cle = useCleTheme()
  const am = useJson<AmontFile>('amont/national.json').data
  const t = useJson<ThemeFile>('themes/nitrates.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const { deps } = useDepartements()
  const last = completeYears(meta).slice(-1)[0]
  const share = useMemo(() => {
    const m = new Map<string, number>()
    if (!t || !last) return m
    for (const [sise, byYear] of Object.entries(t.depts)) {
      const v = byYear[last]
      if (v && v.res_tot) m.set(deptCode(sise), v.res_dep / v.res_tot)
    }
    return m
  }, [t, last])
  // Même échelle que la page Thème et /carte : la rampe de la qualité de l'eau à paliers fixes (5, 10, 20, 40 %), avec sa
  // légende.
  // L'échelle relative à sept paliers de l'ancienne scène ne se comparait à aucune autre carte (audit du 27/09).
  const scale = useMemo(() => qualiteScale(), [cle])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(share.get(String(p.code)) ?? null), [share, scale])
  const nit = am?.ades.nitrates
  return (
    <div className="grid cols-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)', justifyContent: 'stretch' }}>
        <Kpi value={nit ? fmt.pct((100 * nit.sup_seuil) / Math.max(1, nit.n_points), 0) : '–'} label="des points de nappe suivis ont dépassé 50 mg/L de nitrates depuis 2020" sub={nit ? `${fmt.int(nit.n_points)} points de suivi` : ''} />
        <Kpi value={nit ? fmt.int(nit.aep_sup_seuil) : '–'} label="captages d'eau potable concernés" />
        <Kpi value={t && last && t.national[last] ? fmt.int(t.national[last].res_dep ?? 0) : '–'} label={`réseaux avec un dépassement au robinet en ${last ?? '–'}`} ton="warn" />
      </div>
      <div>
        <FranceMap data={deps} colorOf={colorOf} height={700} ariaLabel={`Part des réseaux avec un dépassement de nitrates, par département, ${last ?? ''}`} />
        <MapLegend desc={`part des réseaux du département au-dessus de 50 mg/L en ${last ?? '–'}`} scale={scale} format={(v) => fmt.pct(100 * v, v < 0.1 ? 1 : 0)} />
      </div>
    </div>
  )
}

function VentesRobinet() {
  const cle = useCleTheme()
  const am = useJson<AmontFile>('amont/national.json').data
  const { names } = useDepartements()
  const option = useMemo(() => {
    if (!am) return null
    const p = chartPalette()
    const pts = etiquetterExtremes(
      Object.entries(am.croisement.depts ?? {})
        .filter(([, v]) => v.ventes_kg != null && v.robinet_part_reseaux != null)
        .map(([d, v]) => ({ name: names.get(d) ?? d, value: [v.ventes_kg! / 1000, 100 * v.robinet_part_reseaux!, d] })),
      6,
    )
    return {
      grid: { left: 80, right: 60, top: 30, bottom: 70 },
      xAxis: { type: 'log' as const, name: 'tonnes de substances vendues dans le département (échelle log)', nameLocation: 'middle' as const, nameGap: 45, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize * 0.85 }, nameTextStyle: { color: p.text, fontSize: p.fontSize } },
      yAxis: { type: 'value' as const, name: '% des réseaux avec un dépassement pesticides', ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize * 0.85 }, nameTextStyle: { color: p.text, fontSize: p.fontSize } },
      series: [{ type: 'scatter' as const, labelLayout: { hideOverlap: true }, data: pts, symbolSize: 18, itemStyle: { color: p.mark, opacity: 0.75 }, label: { show: false, position: 'right' as const, color: p.text, fontSize: p.fontSize * 0.8, formatter: (o: { value?: unknown }) => String((o.value as unknown[])[2]) } }],
    }
  }, [am, names, cle])
  if (!option) return <Chargement />
  return <Chart option={option} height={780} exportName="scene-ventes-robinet" />
}

function ChloridazoneMois() {
  return <MonthlySeries code="6378" height={760} />
}

function SecheresseJour() {
  return <VigiEauMap height={760} />
}

const DEFS: Record<string, Omit<SceneDef, 'id'>> = {
  'pesticides-effacement': { titre: 'Pesticides : de 2 900 à 2 000 réseaux avec un dépassement', sousTitre: "Réseaux de distribution avec au moins une analyse au-dessus de la limite de qualité, par millésime. La baisse résulte d'une modification de la règle d'évaluation ; l'eau distribuée n'a pas changé.", source: 'Contrôle sanitaire SISE-Eaux, ministère chargé de la Santé', Component: PesticidesEffacement },
  'pfas-depistage': { titre: "PFAS : l'extension de la recherche dans l'eau distribuée", sousTitre: 'Réseaux analysés et réseaux au-dessus de 0,1 µg/L pour la somme des 20 PFAS.', source: 'Contrôle sanitaire SISE-Eaux', Component: PfasDepistage },
  'prix-fuites': { titre: "Services d'eau : prix, pertes, renouvellement et gestion", sousTitre: "Quatre indicateurs nationaux des services d'eau potable, pour la dernière année disponible.", source: 'SISPEA, Office français de la biodiversité', Component: PrixFuites },
  'prix-depuis-2008': { titre: 'Le prix du m³ depuis 2009', sousTitre: 'Prix médian TTC des services déclarants, pour une consommation de 120 m³ par an. Pour 2019, les déclarants sont trop peu nombreux pour établir une médiane fiable.', source: "SISPEA, API Hub'Eau puis extractions annuelles", Component: PrixDepuis2008 },
  'nitrates-nappe-robinet': { titre: 'Nitrates : de la nappe au robinet', sousTitre: 'Dépassements de 50 mg/L de nitrates dans les eaux souterraines suivies et dans l’eau distribuée.', source: 'ADES (BRGM) et contrôle sanitaire SISE-Eaux', Component: NitratesNappeRobinet },
  'ventes-robinet': { titre: 'Ventes de pesticides et dépassements au robinet', sousTitre: "Chaque point représente un département. L'axe horizontal indique les tonnes de substances vendues, l'axe vertical la part des réseaux avec un dépassement en pesticides.", source: 'BNV-D (OFB) et contrôle sanitaire SISE-Eaux', Component: VentesRobinet },
  'chloridazone-mois': { titre: 'Chloridazone desphényl, mois par mois', sousTitre: "La chloridazone est un herbicide interdit depuis 2020. Son métabolite reste le paramètre qui compte le plus de dépassements de la limite de qualité en France.", source: 'Contrôle sanitaire SISE-Eaux', Component: ChloridazoneMois },
  'secheresse-jour': { titre: 'Sécheresse : restrictions du jour', sousTitre: 'Niveau maximal de restriction par département, en direct.', source: 'VigiEau, ministère de la Transition écologique', Component: SecheresseJour },
}

export const SCENES: SceneDef[] = (ids as string[]).filter((id) => DEFS[id]).map((id) => ({ id, ...DEFS[id] }))

import TableauDeptsValeur from '../components/TableauDeptsValeur'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Chart, { axisDefaults } from '../components/Chart'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { couleursClasses, moisFr, partSous } from '../lib/nappes'
import { stepScale } from '../lib/scale'
import { chartPalette, useCleTheme } from '../lib/theme'
import { usePageTitle } from '../lib/title'
import type { NappesNational } from '../lib/types'
import { lienDepartement } from '../lib/parcours'
import Kpi from '../components/Kpi'

/** Part des piézomètres « bas » ou « très bas » (les deux classes les plus basses) dans un décompte par classe. */
function partBasse(c: number[] | undefined): number | null {
  if (!c) return null
  const tot = c.reduce((a, b) => a + b, 0)
  return tot ? (c[0] + c[1]) / tot : null
}

/** Niveau des nappes en France : chaque piézomètre situé par rapport aux mêmes mois des années passées. */
export default function Nappes() {
  const cle = useCleTheme()
  usePageTitle('Le niveau des nappes', 'Niveau des nappes phréatiques par rapport aux années passées, mois par mois et département par département.')
  const nat = useJson<NappesNational>('nappes/national.json').data
  const { deps, names } = useDepartements()
  const [survol, setSurvol] = useState<string | null>(null)

  const ref = nat?.mois_ref
  // Moins de 3 piézomètres classés : gris, comme dans le classement (« 100 % sur 1 » ne dit rien d'un
  // département). Paliers ronds fixes, les mêmes que l'indicateur « nappes basses » de la page Ressource.
  const valeur = useCallback(
    (dd: string) => {
      const c = nat && ref ? nat.depts[dd]?.[ref] : undefined
      if (!c || c.reduce((a, b) => a + b, 0) < 3) return null
      return partBasse(c)
    },
    [nat, ref],
  )
  // Ocre, comme les classes basses du graphique voisin (audit du 27/09 : l'ardoise y désigne le côté « haut »).
  const scale = useMemo(() => stepScale([0, 0.1, 0.25, 0.4, 0.6, 0.8], { rampe: 'ocre' }), [cle])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(valeur(String(p.code))), [scale, valeur])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const c = nat && ref ? nat.depts[String(p.code)]?.[ref] : undefined
      if (!c) return `<b>${p.nom}</b> (${p.code})<br>aucun piézomètre classé`
      const tot = c.reduce((a, b) => a + b, 0)
      const part = tot >= 3 ? `${fmt.pct((100 * (c[0] + c[1])) / tot, 0)} des piézomètres bas ou très bas<br>` : ''
      return `<b>${p.nom}</b> (${p.code})<br>${part}<span class="muted">${c[0] + c[1]} sur ${tot} piézomètres classés</span>`
    },
    [nat, ref],
  )

  const evolution = useMemo(() => {
    if (!nat) return null
    const p = chartPalette()
    const couleurs = couleursClasses()
    const parts = (i: number) =>
      nat.mois.map((m) => {
        const c = nat.historique[m]
        const tot = c ? c.reduce((a, b) => a + b, 0) : 0
        return tot ? Math.round((1000 * c[i]) / tot) / 10 : null
      })
    return {
      grid: { left: 44, right: 12, top: 56, bottom: 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : `${fmt.dec(Number(v), 1)} %`) },
      // Légende défilante : sur mobile, ses sept classes tenaient sur trois lignes et chevauchaient le tracé.
      legend: { top: 0, type: 'scroll' as const, data: nat.classes, textStyle: { color: p.muted, fontSize: p.fontSize } },
      // Mois écrits en français (« sept. 21 ») au lieu de « 21-09 ».
      xAxis: { type: 'category' as const, data: nat.mois.map((m) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })), ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize, interval: 5 } },
      yAxis: { type: 'value' as const, max: 100, ...axisDefaults(), axisLabel: { color: p.muted, fontSize: p.fontSize, formatter: '{value} %' } },
      // Très bas en haut de la pile : les classes basses se lisent contre le bord supérieur, les hautes contre l'axe.
      series: nat.classes
        .map((nom, i) => ({ type: 'bar' as const, name: nom, stack: 'c', barCategoryGap: '8%', data: parts(i), itemStyle: { color: couleurs[i] } }))
        .reverse(),
    }
  }, [nat, cle])

  const classement = useMemo(() => {
    if (!nat || !ref) return []
    return Object.entries(nat.depts)
      .map(([dd, parMois]) => ({ dd, c: parMois[ref] }))
      .filter((r) => r.c)
      .map((r) => ({ ...r, v: partBasse(r.c) ?? 0, n: r.c!.reduce((a, b) => a + b, 0) }))
      // Au moins 3 piézomètres : « 100 % sur 1 » ne dit rien d'un département.
      .filter((r) => r.n >= 3)
      .sort((a, b) => b.v - a.v || b.n - a.n)
  }, [nat, ref])

  if (!nat || !ref) return <Chargement reserve />
  const c = nat.historique[ref]
  const tot = c ? c.reduce((a, b) => a + b, 0) : 0
  const ilya1an = nat.historique[nat.mois[nat.mois.length - 13]]

  return (
    <div className="page">
      <p className="eyebrow">La ressource</p>
      <Crumbs items={[{ label: 'La ressource', to: '/ressource-en-eau' }, { label: 'Le niveau des nappes' }]} />
      <h1>Le niveau des nappes · {moisFr(ref)}</h1>
      <p className="lead">
        Un piézomètre mesure le niveau d'une nappe d'eau souterraine. Le niveau moyen du mois est comparé à celui des mêmes mois des années
        passées. Une nappe classée basse en août l'est donc par rapport aux autres mois d'août, indépendamment des niveaux de l'hiver.
      </p>
      <div className="grid cols-4">
        <Kpi value={fmt.pct(100 * (partSous(c) ?? 0), 0)} label={`des piézomètres sous la normale en ${moisFr(ref)}`} sub={`un an plus tôt : ${fmt.pct(100 * (partSous(ilya1an) ?? 0), 0)}`} />
        <Kpi value={fmt.int(c ? c[0] : 0)} label="piézomètres au niveau très bas" sub="parmi les 10 % d'années les plus basses" />
        <Kpi value={fmt.int(c ? c[5] + c[6] : 0)} label="piézomètres au niveau haut ou très haut" sub="au-dessus de 80 % des années passées" />
        <Kpi value={fmt.int(tot)} label="piézomètres classés ce mois-ci" sub="suivis depuis au moins 15 ans" />
      </div>

      <div className="card">
        <h2>Répartition mensuelle des piézomètres par classe de niveau, sur cinq ans</h2>
        <Chart option={evolution!} height={360} exportName="nappes-evolution" />
        <div className="source">Répartition des piézomètres classés chaque mois, du plus bas (ocre) au plus haut (ardoise) par rapport aux mêmes mois des années passées.</div>
      </div>

      <h2>Par département · {moisFr(ref)}</h2>
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: 'ressource' }) })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={520}
            ariaLabel={`Part des piézomètres bas ou très bas par département, ${moisFr(ref)}`}
          />
          <MapLegend desc={`part des piézomètres au niveau bas ou très bas, ${moisFr(ref)}`} scale={scale} format={fmt.pctBorne} noDataLabel="moins de 3 piézomètres classés" />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">Par ordre alphabétique ; un tri est proposé. Départements comptant au moins 3 piézomètres classés.</p>
          <TableauDeptsValeur
            valeurs={new Map(classement.map((r) => [r.dd, { v: r.v, n: r.n }]))}
            noms={names}
            titre="Bas ou très bas"
            format={(v) => fmt.pct(100 * v, 0)}
            quoi="la part des piézomètres bas ou très bas"
            effectif="Piézomètres classés"
            lien={(dd) => lienDepartement(dd, { section: 'ressource' })}
            legende={`Départements par ordre alphabétique : part des piézomètres au niveau bas ou très bas, ${moisFr(ref)} ; version textuelle de la carte`}
            csv={{ sujet: 'nappes', annee: ref, entete: 'Part des piézomètres bas ou très bas (0–1)' }}
            selection={survol}
            onSurvol={setSurvol}
          />
        </div>
      </div>

      <div className="source">
        Source : piézométrie Hub'Eau (BRGM, réseaux de suivi des eaux souterraines). Piézomètres actifs suivis depuis au moins 15 ans ; niveau
        moyen mensuel comparé au même mois des années antérieures (30 ans au plus), classé selon les seuils de l'indicateur piézométrique
        standardisé du BRGM. Le classement est calculé par le site à partir du rang de chaque mesure et ne reproduit pas l'indicateur officiel ;
        ses classes sont comparables à celles du bulletin du BRGM, mais ses chiffres ne le sont pas. <Link to="/methode#nappes">Méthode</Link> · <Link to="/secheresse">Restrictions sécheresse</Link>.
      </div>
    </div>
  )
}

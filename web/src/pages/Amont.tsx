import TableauDeptsValeur from '../components/TableauDeptsValeur'
import BarreAnnee from '../components/BarreAnnee'
import { useCallback, useMemo, useState } from 'react'
import Chargement from '../components/Chargement'
import { useSearchParams } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { usePageTitle } from '../lib/title'
import FranceMap from '../components/FranceMap'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { useCleTheme } from '../lib/theme'
import { pctCarte } from '../lib/carte'
import { qualiteScale, stepScale } from '../lib/scale'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { useDensite } from '../lib/densite'
import type { AmontFile } from '../lib/types'
import { INDICS_AMONT as INDICS, type IndicAmont } from '../lib/amont'
import { lienDepartement } from '../lib/parcours'
import IndicInconnu from '../components/IndicInconnu'
import Kpi from '../components/Kpi'

export default function Amont() {
  const cle = useCleTheme()
  const am = useJson<AmontFile>('amont/national.json').data
  const [densite] = useDensite()
  const { deps, names: deptName } = useDepartements()
  // Indicateur de la carte dans l'URL (?indic=), comme sur la carte principale.
  const [sp, setSp] = useSearchParams()
  const ind = INDICS.find((i) => i.key === sp.get('indic')) ?? INDICS[0]
  const indicInconnu = !!sp.get('indic') && !INDICS.some((i) => i.key === sp.get('indic'))
  const setIndic = (k: IndicAmont) => {
    const next = new URLSearchParams(sp)
    if (k === INDICS[0].key) next.delete('indic')
    else next.set('indic', k)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)
  usePageTitle("L'amont du robinet", "Prélèvements pour l'eau potable, ventes de pesticides, état des nappes et des rivières, département par département.")
  const cro = am?.croisement.depts ?? {}
  const deptVal = useMemo(() => {
    const m = new Map<string, number>()
    for (const [d, v] of Object.entries(cro)) {
      const x = ind.get(v)
      if (x != null) m.set(d, x)
    }
    return m
  }, [cro, ind])
  // Part de réseaux non conformes au robinet : rampe de la qualité de l'eau (bleu → jaune → rouge), comme l'accueil, la carte et
  // les thèmes ; les autres indicateurs de l'amont, du contexte, restent sur l'ardoise.
  const echelle = useMemo(
    () => (ind.key === 'robinet' ? qualiteScale(100) : stepScale(ind.paliers, { invert: ind.higherIsWorse === false })),
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

  if (!am) return <Chargement reserve />
  // Millésime commun aux deux sources (BNPE, BNV-D), qui ont chacune leur propre calendrier et 16/7 ans
  // d'historique inexploité jusqu'ici (revue design du 2026-09-22 : la page n'affichait que la dernière
  // année de chacune, sans aucun moyen de consulter les précédentes). Intersection plutôt que deux
  // sélecteurs séparés : la question posée par la page est « où en est-on », pas « BNPE de quelle année ».
  const anneesCommunes = Object.keys(am.bnpe.annees ?? {})
    .filter((a) => am.bnvd.annees?.[a])
    .sort()
  // Clé propre à cette page (choix de l'auteur, 25/09) : ailleurs, « annee » est l'année du contrôle sanitaire. L'ancienne
  // clé reste lue, pour les liens déjà partagés.
  const anneeUrl = sp.get('amont') ?? sp.get('annee')
  const annee = anneesCommunes.includes(anneeUrl ?? '') ? anneeUrl! : anneesCommunes[anneesCommunes.length - 1]
  const setAnnee = (a: string) => {
    const next = new URLSearchParams(sp)
    next.delete('annee')
    next.set('amont', a)
    setSp(next, { replace: true })
  }
  const bnpeY = am.bnpe.annees?.[annee]
  const bnvdY = am.bnvd.annees?.[annee]
  const nit = am.ades.nitrates
  const pest = am.ades.pesticides

  return (
    <div className="page">
      <p className="eyebrow">La ressource</p>
      <Crumbs items={[{ label: 'La ressource', to: '/ressource-en-eau' }, { label: "L'amont du robinet" }]} />
      <h1>L'amont du robinet</h1>
      <p className="lead">
        Cette page décrit l'origine de l'eau potable, l'état des nappes et des rivières dont elle est tirée et les ventes de produits
        phytopharmaceutiques, département par département.
      </p>

      {/* Millésime scopé aux deux seuls chiffres qu'il fait varier (BNPE, BNV-D ont un historique ; la
          carte et le reste de la page sont une situation fixe, cf. plus bas) : un sélecteur dans le
          toolbar de page aurait laissé croire qu'il pilote toute la page (revue design du 2026-09-22). */}
      <BarreAnnee
        titre="Prélèvements et ventes"
        titreSection
        note="L’année vaut pour les prélèvements et les ventes ; les autres chiffres, la carte et la suite de la page montrent la situation la plus récente."
        annees={anneesCommunes.map((a) => ({ annee: Number(a), enCours: false, sansDonnees: false }))}
        annee={Number(annee)}
        onChange={(a) => setAnnee(String(a))}
        param="amont"
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
      {/* Le nuage « ventes × réseaux non conformes » est retiré (choix de l'auteur, 2026-10-05) : il rapprochait
          visuellement ventes de pesticides et dépassements au robinet, ce que la règle de prudence exclut. */}
      <Section key={`ventes-${densite}`} id="ventes" titre="Substances les plus vendues" resume="Les substances phytopharmaceutiques les plus vendues en France" ouvert={densite === 'detaille'}>
      <div>
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
          <select value={ind.key} onChange={(e) => setIndic(e.target.value as IndicAmont)}>
            {INDICS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        {indicInconnu && <IndicInconnu affiche={ind.label} />}
      </div>
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: 'services' }) })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={560}
            ariaLabel={`${ind.label} par département`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit})${ind.note ? `, ${ind.note}` : ''}`} scale={echelle} format={(v) => (ind.unit === 't' ? fmt.int(v) : fmt.dec(v, 0))} />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">Par ordre alphabétique ; un tri est proposé.</p>
          <TableauDeptsValeur
            valeurs={deptVal}
            noms={deptName}
            titre={ind.unit}
            format={(v) => fmt.dec(v, 1)}
            quoi={ind.label.toLowerCase()}
            lien={(d) => lienDepartement(d, { section: 'services' })}
            legende={`Départements par ordre alphabétique : ${ind.label} (${ind.unit}) ; version textuelle de la carte`}
            csv={{ sujet: `amont-${ind.key}`, annee: annee ?? '', entete: `${ind.label} (${ind.unit})` }}
            selection={survol}
            onSurvol={setSurvol}
          />
        </div>
      </div>
      <div className="source">
        Sources : BNPE, volumes prélevés (OFB, Hub'Eau) ; BNV-D, ventes de substances par département du siège du distributeur (OFB, Hub'Eau) ; ADES,
        qualité des eaux souterraines (BRGM, Hub'Eau) ; contrôle sanitaire SISE-Eaux. Les ventes sont localisées au point de vente et non au lieu d'épandage.
      </div>
    </div>
  )
}

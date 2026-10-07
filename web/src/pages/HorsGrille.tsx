import BarreAnnee from '../components/BarreAnnee'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { lienDepartement } from '../lib/parcours'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import Section from '../components/Section'
import { RechercheSujet } from '../components/Sujet'
import TableauDeptsTri, { type Colonne } from '../components/TableauDeptsTri'
import { lignesHorsGrille, type LigneHorsGrille } from '../lib/sujets'
import { pctCsv } from '../lib/tableauDepts'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { stepScale } from '../lib/scale'
import { usePageTitle } from '../lib/title'
import { periodeAnnee, type HgGroupe, type HorsGrilleFile, type MetaFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { GROUPES_HG as ORDRE, groupeHg, part100 } from '../lib/horsGrille'
import { anneesFiche, useYear } from '../lib/year'
import Kpi from '../components/Kpi'

const MESURES = [
  { key: 'cherche', label: 'part des communes où la substance est recherchée' },
  { key: 'quantifie', label: 'part des communes où la substance est quantifiée' },
] as const
type Mesure = (typeof MESURES)[number]['key']

/** Valeur mesurée avec une précision adaptée à son ordre de grandeur (µg/L très variables selon la substance). */
function val(v: number | null | undefined): string {
  if (v == null) return '–'
  return fmt.dec(v, v < 1 ? 3 : v < 10 ? 2 : 1)
}

/**
 * Substances analysées sans limite ni référence de qualité : jamais « en dépassement », donc absentes de toutes
 * les vues du site qui comptent des dépassements. Deux questions : les cherche-t-on, et que trouve-t-on ?
 */
export default function HorsGrille() {
  usePageTitle(
    'Substances sans limite de qualité',
    'Perchlorate, TFA, métabolites de pesticides et PFAS pris individuellement : étendue de la recherche et fréquence de quantification des substances analysées sans limite de qualité.',
  )
  const meta = useJson<MetaFile>('meta.json').data
  const hg = useJson<HorsGrilleFile>('horsgrille.json').data
  const { deps, names } = useDepartements()
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  const [densite] = useDensite()
  const ys = y != null ? String(y) : undefined
  const [sp, setSp] = useSearchParams()
  const groupe: HgGroupe = groupeHg(sp.get('groupe')) ?? 'perchlorate'
  const mesure: Mesure = sp.get('mesure') === 'quantifie' ? 'quantifie' : 'cherche'
  const setQ = (k: string, v: string, defaut: string) => {
    const next = new URLSearchParams(sp)
    if (v === defaut) next.delete(k)
    else next.set(k, v)
    setSp(next, { replace: true })
  }
  const [survol, setSurvol] = useState<string | null>(null)

  const parDept = useMemo(() => {
    const m = new Map<string, { tot: number; ch: number; qt: number }>()
    const d = ys ? hg?.depts[groupe]?.[ys] : undefined
    for (const [dd, [tot, ch, qt]] of Object.entries(d ?? {})) m.set(dd, { tot, ch, qt })
    return m
  }, [hg, groupe, ys])
  const part = useCallback(
    (dd: string) => {
      const r = parDept.get(dd)
      if (!r || !r.tot) return null
      return (mesure === 'cherche' ? r.ch : r.qt) / r.tot
    },
    [parDept, mesure],
  )
  // Paliers ronds fixes par mesure (revue du 2026-09-22) : la recherche couvre souvent tout un
  // département, la quantification rarement plus de quelques pour cent des communes.
  const scale = useMemo(() => stepScale(mesure === 'cherche' ? [0, 0.1, 0.25, 0.5, 0.75, 0.9] : [0, 0.01, 0.05, 0.1, 0.25, 0.5], { rampe: 'qualite' }), [mesure])
  const lignesTableau = useMemo(() => (ys ? lignesHorsGrille(hg, groupe, ys, (dd) => names.get(dd) ?? dd) : []), [hg, groupe, ys, names])
  const colonnesHg = useMemo<Colonne<LigneHorsGrille>[]>(
    () => [
      { cle: 'cherche', titre: 'Recherché', num: true, quoi: 'la part des communes où le groupe est recherché', valeur: (l) => l.partCherche, cellule: (l) => part100(l.cherche, l.communes, true) },
      {
        cle: 'quantifie',
        titre: 'Quantifié',
        num: true,
        quoi: 'la part des communes où le groupe est quantifié',
        valeur: (l) => l.partQuantifie,
        cellule: (l) => (
          <>
            {part100(l.quantifie, l.communes, true)} <span className="muted">({fmt.int(l.quantifie)})</span>
          </>
        ),
      },
    ],
    [],
  )
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(part(String(p.code))), [scale, part])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const r = parDept.get(String(p.code))
      if (!r) return `<b>${p.nom}</b> (${p.code})<br>jamais recherché ce millésime`
      return `<b>${p.nom}</b> (${p.code})<br>recherché dans ${fmt.int(r.ch)} communes sur ${fmt.int(r.tot)}<br>quantifié dans ${fmt.int(r.qt)}`
    },
    [parDept],
  )

  const substances = useMemo(() => {
    if (!hg || !ys) return []
    return Object.entries(hg.substances)
      .filter(([, s]) => s.g === groupe && s.annees[ys])
      .map(([code, s]) => ({ code, ...s, a: s.annees[ys] }))
      .sort((x, z) => (z.a.com_q ?? 0) - (x.a.com_q ?? 0) || z.a.nq - x.a.nq)
  }, [hg, groupe, ys])

  if (!meta || !hg || !ys) return <Chargement reserve />
  const pg = (g: HgGroupe) => hg.par_groupe[g]?.[ys]
  const perch = hg.substances['6219']?.annees[ys]

  return (
    <div className="page">
      <p className="eyebrow">Sujets</p>
      <Crumbs items={[{ label: 'Sujets', to: '/themes' }, { label: 'Substances sans limite de qualité' }]} />
      <h1>Substances sans limite de qualité</h1>
      <p className="lead">
        Le contrôle sanitaire analyse des substances pour lesquelles aucune limite ni référence de qualité n'est fixée. Faute de seuil,
        elles n'apparaissent dans aucun classement ni aucune carte de dépassements. Cette page présente, pour chacune, l'étendue de sa
        recherche et la fréquence de sa quantification. L'absence de résultat peut aussi signifier que la substance n'a pas été recherchée.
      </p>
      <RechercheSujet texte="La fiche de chaque commune indique, dans le détail des analyses, les substances sans limite de qualité recherchées et quantifiées." />
      <BarreAnnee
        titre="Année du bilan"
        note="Elle vaut pour les groupes de substances, les chiffres et les cartes ci-dessous."
        annees={anneesFiche(meta, hg.annees)}
        annee={y}
        onChange={setYear}
      />

      <div className="grid cols-3 hg-groupes">
        {ORDRE.map((g) => {
          const v = pg(g)
          return (
            <button key={g} type="button" className={`card hg-groupe${g === groupe ? ' on' : ''}`} aria-pressed={g === groupe} onClick={() => setQ('groupe', g, 'perchlorate')}>
              <h3>{hg.groupes[g]}</h3>
              {v ? (
                <p className="muted">
                  recherché dans <b>{part100(v.com, v.com_tot)}</b> des communes · quantifié dans <b>{fmt.int(v.com_q)}</b> communes
                  {g !== 'perchlorate' && g !== 'tfa' ? ` · ${v.subst_q} substances quantifiées` : ''}
                </p>
              ) : (
                <p className="muted">jamais recherché ce millésime</p>
              )}
            </button>
          )
        })}
      </div>

      {groupe === 'perchlorate' && perch && (
        <div className="grid cols-4">
          <Kpi value={fmt.int(perch.com ?? 0)} label={`communes où le perchlorate est recherché ${periodeAnnee(meta, ys)}`} sub={`${fmt.int(perch.n)} analyses`} />
          <Kpi value={fmt.int(perch.com_q ?? 0)} label="communes où il est quantifié" sub={`${fmt.pct((100 * perch.nq) / Math.max(1, perch.n), 0)} des analyses`} />
          <Kpi value={fmt.int(perch.au_dela?.['4']?.com ?? 0)} label="communes au-delà de 4 µg/L" sub="eau déconseillée pour la préparation des biberons des nourrissons de moins de 6 mois" />
          <Kpi value={fmt.int(perch.au_dela?.['15']?.com ?? 0)} label="communes au-delà de 15 µg/L" sub="eau également déconseillée aux femmes enceintes et allaitantes" />
        </div>
      )}

      <div className="toolbar">
        <h2>
          {hg.groupes[groupe]} par département {periodeAnnee(meta, ys)}
        </h2>
        <label>
          Mesure{' '}
          <select value={mesure} onChange={(e) => setQ('mesure', e.target.value, 'cherche')}>
            {MESURES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
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
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: 'hors-grille', groupe }) })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={520}
            message={parDept.size === 0 ? `${hg.groupes[groupe]} : aucune recherche en ${ys}.` : null}
            ariaLabel={`${hg.groupes[groupe]} : ${MESURES.find((m) => m.key === mesure)!.label}, par département, ${ys}`}
          />
          <MapLegend desc={`${MESURES.find((m) => m.key === mesure)!.label} (${hg.groupes[groupe]}, ${ys})`} scale={scale} format={fmt.pctBorne} noDataLabel="jamais recherché" />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">Par ordre alphabétique ; un tri est proposé. Part des communes du département où le groupe est recherché, puis quantifié.</p>
          <TableauDeptsTri
            lignes={lignesTableau}
            colonnes={colonnesHg}
            lien={(dd) => lienDepartement(dd, { section: 'hors-grille', groupe })}
            legende={`Les départements où ${hg.groupes[groupe]} a été recherché en ${ys}, par ordre alphabétique ou selon le tri choisi ; version textuelle de la carte`}
            selection={survol}
            onSurvol={setSurvol}
            unite="communes"
            csv={{
              sujet: `hors-grille-${groupe}`,
              annee: ys,
              entetes: ['Code du département', 'Département', 'Année', 'Groupe', 'Communes avec prélèvements', 'Communes où recherché', 'Communes où quantifié', 'Part des communes où recherché (%)', 'Part des communes où quantifié (%)'],
              ligne: (l) => [l.dd, l.nom, ys, hg.groupes[groupe], l.communes, l.cherche, l.quantifie, pctCsv(l.partCherche), pctCsv(l.partQuantifie)],
            }}
          />
          <p className="muted">En {ys}, ce groupe n'a été recherché dans aucune commune de {fmt.nb(101 - parDept.size, 'département')}.</p>
        </div>
      </div>

      {/* Détail par substance replié (audit du 2026-09-22) : le groupe choisi ci-dessus, ses KPI et sa
          carte répondent déjà à « cherche-t-on, trouve-t-on » ; cette table descend substance par substance. */}
      <Section
        key={`substances-${densite}`}
        id="substances"
        titre={`${hg.groupes[groupe]} : substance par substance`}
        resume={`${substances.length} substance${substances.length > 1 ? 's' : ''} analysée${substances.length > 1 ? 's' : ''} en ${ys}`}
        ouvert={densite === 'detaille'}
      >
      <div className="card">
        {substances.length === 0 ? (
          <p className="muted">Aucune analyse ce millésime.</p>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Substance</th>
                  <th className="num">Analyses</th>
                  <th className="num">Part quantifiée</th>
                  <th className="num">Communes où recherchée</th>
                  <th className="num">Communes où quantifiée</th>
                  <th className="num">Maximum</th>
                  <th>Repère cité par l'ARS</th>
                </tr>
              </thead>
              <tbody>
                {substances.slice(0, 40).map((s) => (
                  <tr key={s.code}>
                    <td>{s.l}</td>
                    <td className="num">{fmt.int(s.a.n)}</td>
                    <td className="num">{fmt.pct((100 * s.a.nq) / Math.max(1, s.a.n), 0)}</td>
                    <td className="num">{fmt.int(s.a.com ?? 0)}</td>
                    <td className="num">{fmt.int(s.a.com_q ?? 0)}</td>
                    <td className="num">
                      {val(s.a.vmax)} {s.u ?? ''}
                    </td>
                    <td className="muted">
                      {s.reperes.length === 0
                        ? 'aucun'
                        : s.reperes.map((r) => (
                            <div key={r.v}>
                              {fmt.dec(r.v, r.v < 1 ? 1 : 0)} {s.u ?? ''} : {fmt.int(s.a.au_dela?.[String(r.v)]?.com ?? 0)} communes au-delà
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {substances.some((s) => s.reperes.length) && (
          <div className="source">
            Repères : {[...new Map(substances.flatMap((s) => s.reperes).map((r) => [r.v, r])).values()].map((r) => `${fmt.dec(r.v, r.v < 1 ? 1 : 0)} µg/L, ${r.lib} (${r.src})`).join(' ; ')}.
            Ces repères ne sont pas des limites de qualité.
          </div>
        )}
      </div>
      </Section>

      <div className="source">
        Source : contrôle sanitaire SISE-Eaux. Sont retenues les substances analysées sans limite ni référence de qualité. Une substance est
        comptée comme recherchée dans une commune lorsqu'au moins une analyse a été réalisée dans l'année sur un réseau qui la dessert, et comme
        quantifiée lorsqu'au moins un résultat dépasse le seuil de quantification. Les repères indiqués sont uniquement ceux que les ARS citent
        dans les conclusions des prélèvements.{' '}
        <Link to="/methode#hors-grille">Méthode</Link>.
      </div>
    </div>
  )
}

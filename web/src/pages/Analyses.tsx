import BarreAnnee from '../components/BarreAnnee'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import Section from '../components/Section'
import ToutDeplier from '../components/ToutDeplier'
import { fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { fetchAnalysesCommune, parseSeuil, type Analyse } from '../lib/hubeau'
import { deptOfInsee, type CommuneIndexEntry, type Famille, type MetaFile, type ParamsFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { anneesFiche, useYear } from '../lib/year'
import Kpi from '../components/Kpi'

interface ParamAgg {
  code: string
  label: string
  unit: string | null
  fam: Famille | 'autre'
  n: number
  nq: number
  nd: number
  nr: number
  max: number | null
  last: number | null
  lastTxt: string | null
  lastDate: string | null
  lim: string | null
  ref: string | null
}

const FAM_ORDER: (Famille | 'autre')[] = ['pesticides', 'pfas', 'azote', 'microbio', 'metaux_mineraux', 'organiques', 'radioactivite', 'physico_chimie', 'organoleptique', 'autre']

/** Toutes les analyses réglementaires d'une commune pour un millésime, lues en direct chez Hub'Eau. */
export default function Analyses() {
  const { code = '' } = useParams()
  const dept = deptOfInsee(code)
  const { names } = useDepartements()
  const meta = useJson<MetaFile>('meta.json').data
  const params = useJson<ParamsFile>('params.json').data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const nom = index?.find((e) => e.c === code)?.n ?? code
  const [shared, setYear] = useYear(meta)
  const [densite] = useDensite()
  const y = shared ?? new Date().getFullYear()
  const [rows, setRows] = useState<Analyse[] | null>(null)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [onlyQuant, setOnlyQuant] = useState(false)
  const [tentative, setTentative] = useState(0)

  // La page ne remonte pas en passant d'une commune à l'autre : sans ce reset, un filtre ou la case
  // « quantifiés seulement » cochée sur une commune resterait actif (et potentiellement trompeur) sur la suivante.
  useEffect(() => {
    setFilter('')
    setOnlyQuant(false)
  }, [code])

  useEffect(() => {
    if (!code || !meta) return
    let alive = true
    setRows(null)
    setError(null)
    setProgress(null)
    fetchAnalysesCommune(code, y, (d, t) => alive && setProgress([d, t]))
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [code, y, meta, tentative])

  const agg = useMemo(() => {
    if (!rows) return null
    const byParam = new Map<string, ParamAgg>()
    const plv = new Map<string, Analyse>()
    for (const r of rows) {
      const p = r.code_parametre
      let a = byParam.get(p)
      if (!a) {
        const info = params?.params[p]
        a = {
          code: p, label: info?.l ?? `Paramètre ${p}`, unit: info?.u ?? null, fam: info?.f ?? 'autre',
          n: 0, nq: 0, nd: 0, nr: 0, max: null, last: null, lastTxt: null, lastDate: null,
          lim: r.limite_qualite_parametre || null, ref: r.reference_qualite_parametre || null,
        }
        byParam.set(p, a)
      }
      // La limite/référence peut manquer sur la première ligne reçue et être présente sur une suivante (le
      // champ n'est pas toujours renseigné par le laboratoire) : sans ce complément, la colonne resterait à
      // « – » tout en affichant un badge de dépassement calculé, lui, sur une ligne où la limite était connue.
      if (!a.lim && r.limite_qualite_parametre) a.lim = r.limite_qualite_parametre
      if (!a.ref && r.reference_qualite_parametre) a.ref = r.reference_qualite_parametre
      const v = r.resultat_numerique
      const quant = (v != null && v > 0) || (!!r.resultat_alphanumerique && !r.resultat_alphanumerique.startsWith('<') && v == null)
      a.n++
      if (quant) a.nq++
      if (v != null) {
        if (a.max == null || v > a.max) a.max = v
        const lim = parseSeuil(r.limite_qualite_parametre)
        const ref = parseSeuil(r.reference_qualite_parametre)
        if ((lim.max != null && v > lim.max) || (lim.min != null && v < lim.min)) a.nd++
        if ((ref.max != null && v > ref.max) || (ref.min != null && v < ref.min)) a.nr++
      }
      if (!a.lastDate || r.date_prelevement > a.lastDate) {
        a.lastDate = r.date_prelevement
        a.last = v
        a.lastTxt = r.resultat_alphanumerique
      }
      if (!plv.has(r.code_prelevement) || (plv.get(r.code_prelevement)!.date_prelevement < r.date_prelevement)) plv.set(r.code_prelevement, r)
    }
    const prelevements = [...plv.values()].sort((a, b) => (a.date_prelevement < b.date_prelevement ? 1 : -1))
    const ncBact = prelevements.filter((p) => p.conformite_limites_bact_prelevement === 'N').length
    const ncChim = prelevements.filter((p) => p.conformite_limites_pc_prelevement === 'N').length
    return { byParam, prelevements, ncBact, ncChim }
  }, [rows, params])

  const groups = useMemo(() => {
    if (!agg) return []
    const q = filter.trim().toLowerCase()
    const list = [...agg.byParam.values()].filter((a) => (!q || a.label.toLowerCase().includes(q) || a.code.includes(q)) && (!onlyQuant || a.nq > 0))
    list.sort((a, b) => b.nd - a.nd || b.nq - a.nq || b.n - a.n)
    return FAM_ORDER.map((f) => ({ f, items: list.filter((a) => a.fam === f) })).filter((g) => g.items.length)
  }, [agg, filter, onlyQuant])

  const famLabel = (f: Famille | 'autre') => (f === 'autre' ? 'Autres' : params?.familles[f] ?? f)

  return (
    <div className="page">
      <p className="eyebrow">Ma commune</p>
      {/* Fil d'Ariane partagé (revue design du 2026-09-22) : cette page recréait le sien à la main, avec
          « Accueil » là où <Crumbs> écrit toujours « France ». */}
      <Crumbs items={[{ label: names.get(dept) ?? dept, to: `/departement/${dept}` }, { label: nom, to: `/commune/${code}` }, { label: 'analyses réglementaires' }]} />
      <h1>{nom} · toutes les analyses réglementaires</h1>
      <BarreAnnee titre="Année des données" note="Les analyses ci-dessous sont celles de l’année choisie." annees={anneesFiche(meta)} annee={y} onChange={setYear} />

      {error && (
        <div className="card">
          <p>
            Hub'Eau n'a pas répondu ({error}). L'API connaît des indisponibilités passagères.
          </p>
          <button className="btn" onClick={() => setTentative((t) => t + 1)}>
            Réessayer
          </button>{' '}
          <Link to={`/commune/${code}`} className="btn">
            Revenir aux chiffres agrégés de la commune
          </Link>
        </div>
      )}
      {!rows && !error && (
        <p className="muted">
          Interrogation de Hub'Eau…{progress ? ` ${fmt.int(progress[0])} / ${fmt.int(progress[1])} analyses` : ''}
        </p>
      )}
      {rows && progress && rows.length < progress[1] && (
        <p className="muted">
          Hub'Eau annonce {fmt.int(progress[1])} analyses mais n'en a livré que {fmt.int(rows.length)} : une fenêtre dépasse le plafond de
          20 000 lignes de l'API, les chiffres ci-dessous sont partiels.
        </p>
      )}
      {rows && agg && (
        <>
          <div className="grid cols-4">
            <Kpi value={fmt.int(rows.length)} label={`analyses en ${y}`} sub={`${fmt.int(agg.byParam.size)} paramètres différents`} />
            <Kpi value={fmt.int(agg.prelevements.length)} label="prélèvements" sub={`${agg.ncBact} non conformes bactério · ${agg.ncChim} chimie`} />
            <Kpi
              value={fmt.int([...agg.byParam.values()].reduce((s, a) => s + a.nd, 0))}
              label="résultats au-dessus d'une limite de qualité"
              ton="warn"
              sub={`${[...agg.byParam.values()].filter((a) => a.nd > 0).length} paramètres concernés`}
            />
            <Kpi
              value={fmt.int([...agg.byParam.values()].filter((a) => a.nq > 0).length)}
              label="paramètres quantifiés au moins une fois"
              sub={`${fmt.int([...agg.byParam.values()].filter((a) => a.nq === 0).length)} jamais détectés`}
            />
          </div>

          <div className="toolbar">
            <input className="search" style={{ maxWidth: 360 }} placeholder="Filtrer un paramètre…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <label>
              <input type="checkbox" checked={onlyQuant} onChange={(e) => setOnlyQuant(e.target.checked)} /> quantifiés seulement
            </label>
            <button className="btn" onClick={() => exportCsv(nom, y, [...agg.byParam.values()])}>
              Export CSV
            </button>
          </div>

          {/* Une famille peut avoir jusqu'à neuf tableaux d'affilée : repliées par défaut (audit du
              2026-09-22), le filtre ci-dessus reste le moyen le plus rapide de retrouver un paramètre précis. */}
          <ToutDeplier />
          {groups.map((g) => {
            const nd = g.items.filter((a) => a.nd > 0).length
            return (
            <Section
              id={`fam-${g.f}`}
              key={`${g.f}-${densite}`}
              titre={famLabel(g.f)}
              resume={`${g.items.length} paramètre${g.items.length > 1 ? 's' : ''}${nd ? ` · ${nd} au-dessus d'une limite` : ''}`}
              ouvert={densite === 'detaille'}
            >
            <div className="card">
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Paramètre</th>
                      <th className="num">Analyses</th>
                      <th className="num">Quantifiées</th>
                      <th className="num">Dernier résultat</th>
                      <th className="num">Maximum</th>
                      <th>Limite de qualité</th>
                      <th>Référence</th>
                      <th className="num">Dépassements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((a) => (
                      <tr key={a.code}>
                        <td>
                          {a.label} <span className="muted">· {a.code}</span>
                        </td>
                        <td className="num">{fmt.int(a.n)}</td>
                        <td className="num">{a.nq ? fmt.int(a.nq) : <span className="muted">0</span>}</td>
                        <td className="num">
                          {a.lastTxt ?? fmt.dec(a.last, 3)} {a.unit && a.last != null ? a.unit : ''}
                          {a.lastDate && <span className="muted"> ({a.lastDate.slice(8, 10)}/{a.lastDate.slice(5, 7)})</span>}
                        </td>
                        <td className="num">{a.max == null ? '–' : `${fmt.dec(a.max, 3)} ${a.unit ?? ''}`}</td>
                        <td className="muted">{a.lim ?? '–'}</td>
                        <td className="muted">{a.ref ?? '–'}</td>
                        <td className="num">
                          {a.nd > 0 ? <strong>{a.nd}</strong> : a.nr > 0 ? `${a.nr} réf.` : <span className="muted">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </Section>
            )
          })}

          <Section key={`prelevements-${densite}`} id="prelevements" titre="Derniers prélèvements" resume="Date, réseau et conclusion de chaque prélèvement récent" ouvert={densite === 'detaille'}>
          <div className="card">
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Réseau</th>
                  <th>Distributeur</th>
                  <th>Conclusion</th>
                </tr>
              </thead>
              <tbody>
                {agg.prelevements.slice(0, 15).map((p) => (
                  <tr key={p.code_prelevement}>
                    <td>{p.date_prelevement.slice(0, 10)}</td>
                    <td>{p.reseaux?.map((r) => r.nom).join(', ')}</td>
                    <td className="muted">{p.nom_distributeur}</td>
                    <td>
                      {p.conformite_limites_bact_prelevement === 'N' || p.conformite_limites_pc_prelevement === 'N' ? <strong>non conforme</strong> : 'conforme'}{' '}
                      <span className="muted">{p.conclusion_conformite_prelevement}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
          </Section>
          <div className="source">
            Source : Hub'Eau, API « qualité de l'eau potable » (ministère chargé de la Santé), interrogée en direct pour la commune {code}. Dépassements
            calculés en comparant chaque résultat numérique à la limite de qualité ; les résultats « &lt; seuil » valent 0.
          </div>
        </>
      )}
    </div>
  )
}

function exportCsv(nom: string, year: number, items: ParamAgg[]) {
  const head = ['code', 'parametre', 'famille', 'unite', 'analyses', 'quantifiees', 'dernier', 'date_dernier', 'maximum', 'limite', 'reference', 'depassements_limite', 'depassements_reference']
  const lines = items.map((a) => [a.code, a.label, a.fam, a.unit ?? '', a.n, a.nq, a.last ?? a.lastTxt ?? '', a.lastDate ?? '', a.max ?? '', a.lim ?? '', a.ref ?? '', a.nd, a.nr].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `analyses-${nom.replace(/[^\w-]+/g, '_')}-${year}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

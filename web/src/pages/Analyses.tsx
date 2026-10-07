import BarreAnnee from '../components/BarreAnnee'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Crumbs, { echelleFrance } from '../components/Crumbs'
import Section from '../components/Section'
import ToutDeplier from '../components/ToutDeplier'
import { fmt } from '../lib/data'
import { libelleParametre } from '../lib/parametres'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { fetchAnalysesCommune, parseSeuil, type Analyse, messageErreurHubeau } from '../lib/hubeau'
import { ecartsDuCode } from '../lib/arrete2007'
import { horsJugement, NON_PERTINENTS, sansLimite } from '../lib/situations'

/** Total des pesticides analysés (recopié de TOTAUX_PESTICIDES, pipeline/robinet/themes.py). */
const TOTAUX_PESTICIDES = ['6276']
import { deptOfInsee, type CommuneIndexEntry, type DeptFile, type Famille, type MetaFile, type ParamsFile } from '../lib/types'
import { useDensite } from '../lib/densite'
import { usePageTitle } from '../lib/title'
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
  /** remarque du détail : métabolite non pertinent (valeur indicative), paramètre hors du jugement du réseau */
  remarque: string | null
}

/** Valeur indicative d'un métabolite non pertinent (arrêté du 11 janvier 2007 modifié, annexe I). */
const VALEUR_INDICATIVE_NP = 0.9

/**
 * Type de seuil d'un paramètre analysé (choix de l'auteur, 2026-10-05, « Colonne type de seuil aux analyses ») : celui
 * des résultats publiés, sauf pour un métabolite non pertinent, qui n'a plus qu'une valeur indicative ; les seuils de
 * l'arrêté sont dans la Méthode (#arrete).
 */
function typeSeuil(a: ParamAgg, annee: number): string {
  if (sansLimite(a.code, annee)) return 'valeur indicative'
  if (a.lim && a.ref) return 'limite et référence'
  if (a.lim) return 'limite de qualité'
  if (a.ref) return 'référence de qualité'
  return 'aucun seuil'
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
  // Réseaux qui desservent la commune, année par année (fichier départemental) : la page lit leurs analyses.
  const deptFile = useJson<DeptFile>(`dept/${dept}.json`)
  // Sans titre propre, la page gardait celui de la page précédente ou le titre générique (vérification du 24/09).
  usePageTitle(
    index ? `${nom} · toutes les analyses` : null,
    index ? `Toutes les analyses réglementaires de l'eau du robinet à ${nom}, paramètre par paramètre, avec leurs limites de qualité.` : null,
  )
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
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

  const reseauxAnnee = (deptFile.data?.communes[code]?.reseaux[String(y)] ?? []).join(',')
  const deptPret = !!deptFile.data || !!deptFile.error
  // Réponse lente de Hub'Eau : un message au bout de 12 s, plutôt qu'une attente muette.
  const [lent, setLent] = useState(false)
  useEffect(() => {
    if (rows || error) return
    setLent(false)
    const t = setTimeout(() => setLent(true), 12_000)
    return () => clearTimeout(t)
  }, [rows, error, code, y, tentative])
  useEffect(() => {
    if (!code || !meta || !deptPret) return
    let alive = true
    setRows(null)
    setError(null)
    setProgress(null)
    fetchAnalysesCommune(code, y, (d, t) => alive && setProgress([d, t]), reseauxAnnee ? reseauxAnnee.split(',') : [])
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(messageErreurHubeau(e)))
    return () => {
      alive = false
    }
  }, [code, y, meta, tentative, deptPret, reseauxAnnee])

  const agg = useMemo(() => {
    if (!rows) return null
    const byParam = new Map<string, ParamAgg>()
    const plv = new Map<string, Analyse>()
    // Total des pesticides jugé sans les métabolites non pertinents qu'il inclut (même règle que le pipeline,
    // themes.resultats_juges) : par prélèvement, somme des substances quantifiées et du métabolite.
    const npActifs = Object.keys(NON_PERTINENTS).filter((c) => sansLimite(c, y))
    const parPlv = new Map<string, { np: Map<string, number>; ind: number }>()
    if (npActifs.length)
      for (const r of rows) {
        const v = r.resultat_numerique
        if (v == null || v <= 0) continue
        const e = parPlv.get(r.code_prelevement) ?? { np: new Map<string, number>(), ind: 0 }
        if (npActifs.includes(r.code_parametre)) e.np.set(r.code_parametre, (e.np.get(r.code_parametre) ?? 0) + v)
        else if (/^<=\s*0,(1|03) µg\/L$/.test(r.limite_qualite_parametre ?? '')) e.ind += v
        parPlv.set(r.code_prelevement, e)
      }
    // Combinaison des métabolites quantifiés qui, ajoutée aux substances, approche le mieux le total déclaré (à écart
    // égal, la plus petite) : un total peut compter R471811 sans l'ESA-métolachlore (pipeline, themes.resultats_juges).
    const totalJuge = (r: Analyse, v: number): number => {
      const e = parPlv.get(r.code_prelevement)
      if (!TOTAUX_PESTICIDES.includes(r.code_parametre) || !e?.np.size) return v
      const vals = [...e.np.values()]
      let retire = 0
      let ecart = Math.abs(v - e.ind)
      for (let m = 1; m < 1 << vals.length; m++) {
        const s = vals.reduce((t, x, k) => ((m >> k) & 1 ? t + x : t), 0)
        const d = Math.abs(v - (e.ind + s))
        if (d < ecart || (d === ecart && s < retire)) [retire, ecart] = [s, d]
      }
      return v - retire
    }
    for (const r of rows) {
      const p = r.code_parametre
      let a = byParam.get(p)
      if (!a) {
        const info = params?.params[p]
        a = {
          code: p, label: libelleParametre(p, info?.l), unit: info?.u ?? null, fam: info?.f ?? 'autre',
          n: 0, nq: 0, nd: 0, nr: 0, max: null, last: null, lastTxt: null, lastDate: null,
          lim: r.limite_qualite_parametre || null, ref: r.reference_qualite_parametre || null,
          // Métabolite non pertinent : SISE retire la limite au fil des saisies ; la page applique la règle de la note
          // (sansLimite, comme l'ARS) pour toute l'année de l'avis de l'Anses et les suivantes.
          remarque: sansLimite(p, y)
            ? `Métabolite classé non pertinent par l’Anses : sans limite de qualité, valeur indicative de ${fmt.dec(VALEUR_INDICATIVE_NP, 1)} µg/L ; hors de la note.`
            : [horsJugement(p), ...ecartsDuCode(p).map((e) => `Écart avec l’arrêté : ${e}`)].filter(Boolean).join(' ') || null,
        }
        byParam.set(p, a)
      }
      // La limite/référence peut manquer sur la première ligne reçue et être présente sur une suivante (le
      // champ n'est pas toujours renseigné par le laboratoire) : sans ce complément, la colonne resterait à
      // « – » tout en affichant un badge de dépassement calculé, lui, sur une ligne où la limite était connue.
      if (sansLimite(p, y)) a.lim = null
      else if (!a.lim && r.limite_qualite_parametre) a.lim = r.limite_qualite_parametre
      if (!a.ref && r.reference_qualite_parametre) a.ref = r.reference_qualite_parametre
      const v = r.resultat_numerique
      const quant = (v != null && v > 0) || (!!r.resultat_alphanumerique && !r.resultat_alphanumerique.startsWith('<') && v == null)
      a.n++
      if (quant) a.nq++
      if (v != null) {
        if (a.max == null || v > a.max) a.max = v
        const lim = parseSeuil(sansLimite(p, y) ? null : r.limite_qualite_parametre)
        const ref = parseSeuil(r.reference_qualite_parametre)
        const vj = totalJuge(r, v)
        if (vj !== v && lim.max != null && v > lim.max && vj <= lim.max)
          a.remarque = 'Total déclaré avec un métabolite non pertinent : jugé sans lui, comme dans la note.'
        if ((lim.max != null && vj > lim.max) || (lim.min != null && vj < lim.min)) a.nd++
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
  }, [rows, params, y])

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
      <p className="eyebrow">Mon eau</p>
      {/* Fil d'Ariane partagé (revue design du 2026-09-22 ; racine « Accueil » partout depuis le 2026-10-06). */}
      <Crumbs items={[echelleFrance, { label: names.get(dept) ?? dept, to: `/departement/${dept}` }, { label: nom, to: `/commune/${code}` }, { label: 'analyses réglementaires' }]} />
      <h1>{nom} · toutes les analyses réglementaires</h1>
      <p className="lead">Les analyses des réseaux d’eau qui desservent la commune, y compris les prélèvements faits dans les communes voisines sur les mêmes réseaux.</p>
      <BarreAnnee titre="Année des analyses" note="Les analyses ci-dessous sont celles de l’année choisie." annees={anneesFiche(meta)} annee={y} onChange={setYear} />

      {error && (
        <div className="card">
          <p>{error} Ces indisponibilités sont en général passagères. Les chiffres de la commune, calculés par le site, restent consultables.</p>
          <button className="btn" onClick={() => setTentative((t) => t + 1)}>
            Réessayer
          </button>{' '}
          <Link to={`/commune/${code}`} className="btn">
            Revenir aux chiffres agrégés de la commune
          </Link>
        </div>
      )}
      {!rows && !error && (
        <p className="muted" role="status">
          Interrogation de Hub’Eau…{progress ? ` ${fmt.int(progress[0])} / ${fmt.int(progress[1])} analyses` : ''}
          {lent && ' Le service répond lentement ; la demande est renouvelée automatiquement.'}
        </p>
      )}
      {rows && progress && rows.length < progress[1] && (
        <p className="muted">
          L'API Hub'Eau indique {fmt.int(progress[1])} analyses, mais n'en a transmis que {fmt.int(rows.length)}. Au moins une des périodes
          interrogées dépasse le plafond de 20 000 lignes fixé par l'API ; les chiffres ci-dessous sont donc partiels.
        </p>
      )}
      {rows && agg && (
        <>
          <div className="grid cols-4">
            <Kpi value={fmt.int(rows.length)} label={`analyses en ${y}`} sub={`${fmt.int(agg.byParam.size)} paramètres différents`} />
            <Kpi value={fmt.int(agg.prelevements.length)} label="prélèvements" sub={`${agg.ncBact} non conformes en bactériologie · ${agg.ncChim} en chimie`} />
            <Kpi
              value={fmt.int([...agg.byParam.values()].reduce((s, a) => s + a.nd, 0))}
              label="résultats au-dessus d'une limite de qualité"
              // Voyant de l'état compté, jamais devant un compte nul (audit du 27/09).
              ton={[...agg.byParam.values()].some((a) => a.nd > 0) ? 'warn' : undefined}
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
                      <th>Type de seuil</th>
                      <th className="num">Dépassements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((a) => (
                      <tr key={a.code}>
                        <td>
                          {a.label} <span className="muted">· {a.code}</span>
                          {a.remarque && <span className="cap analyse-remarque">{a.remarque}</span>}
                        </td>
                        <td className="num">{fmt.int(a.n)}</td>
                        <td className="num">{a.nq ? fmt.int(a.nq) : <span className="muted">0</span>}</td>
                        <td className="num">
                          {a.lastTxt ?? fmt.dec(a.last, 3)} {a.unit && a.last != null ? a.unit : ''}
                          {a.lastDate && <span className="muted"> ({a.lastDate.slice(8, 10)}/{a.lastDate.slice(5, 7)})</span>}
                        </td>
                        <td className="num">{a.max == null ? '–' : `${fmt.dec(a.max, 3)} ${a.unit ?? ''}`}</td>
                        {/* « ≤ 0,1 µg/L » comme partout ailleurs, pas « <=0,1 µg/L » brut (vérification du 24/09). */}
                        <td className="muted">{a.lim ? fmt.seuil(a.lim) : '–'}</td>
                        <td className="muted">{a.ref ? fmt.seuil(a.ref) : '–'}</td>
                        <td>{typeSeuil(a, y)}</td>
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
            Source : Hub'Eau, API « qualité de l'eau potable » (ministère chargé de la Santé), interrogée en direct pour la commune {code}. Les
            dépassements sont calculés en comparant chaque résultat numérique à la limite de qualité ; les résultats notés « &lt; seuil » sont
            comptés comme nuls.
          </div>
        </>
      )}
    </div>
  )
}

function exportCsv(nom: string, year: number, items: ParamAgg[]) {
  const head = ['code', 'parametre', 'famille', 'unite', 'analyses', 'quantifiees', 'dernier', 'date_dernier', 'maximum', 'limite', 'reference', 'type_de_seuil', 'depassements_limite', 'depassements_reference', 'remarque']
  const lines = items.map((a) => [a.code, a.label, a.fam, a.unit ?? '', a.n, a.nq, a.last ?? a.lastTxt ?? '', a.lastDate ?? '', a.max ?? '', a.lim ?? '', a.ref ?? '', typeSeuil(a, year), a.nd, a.nr, a.remarque ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `analyses-${nom.replace(/[^\w-]+/g, '_')}-${year}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

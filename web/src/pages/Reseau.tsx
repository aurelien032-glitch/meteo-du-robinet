import { Fragment, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import AvisEnCours from '../components/AvisEnCours'
import BarreAnnee from '../components/BarreAnnee'
import BlocSerie from '../components/BlocSerie'
import Bulletin from '../components/Bulletin'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import HorsGrilleCard from '../components/HorsGrilleCard'
import OuArrive from '../components/OuArrive'
import QualityStats from '../components/QualityStats'
import RepartitionFamilles from '../components/RepartitionFamilles'
import Search from '../components/Search'
import Section from '../components/Section'
import SeriesAnnee from '../components/SeriesAnnee'
import ToutDeplier from '../components/ToutDeplier'
import { avisDuReseau, groupesAvis, sansInfoBulletin } from '../lib/avis'
import { comptes, type ReseauBulletin } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { useDensite } from '../lib/densite'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { communesDuReseau } from '../lib/reseau'
import { parametreSerie, serieAnnee } from '../lib/serie'
import type { SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import { deptCode, type AvisDeptFile, type CommuneIndexEntry, type DeptFile, type MetaFile, type ParamsFile, type SeriesDeptFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

/**
 * Fiche réseau de distribution (UDI), l'unité réelle des analyses du contrôle sanitaire (maquette du 23/09) : l'avis de
 * l'ARS en cours, daté ; la barre d'année ; le bulletin du réseau (« L'eau de ce réseau est-elle conforme ? ») à côté de
 * « Où arrive cette eau ? » ; la série qui l'explique ; le détail replié. Une année sans prélèvement le dit.
 */
export default function Reseau() {
  const { code = '' } = useParams()
  const dept = deptCode(code.slice(0, 3))
  const file = useJson<DeptFile>(`dept/${dept}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const { names } = useDepartements()
  const r = file.data?.reseaux[code]
  const years = r?.stats ? Object.keys(r.stats).sort() : []
  const [shared, setShared] = useYear(meta)
  const [densite] = useDensite()
  const y = shared != null ? String(shared) : years[years.length - 1]
  const s = y && r?.stats ? r.stats[y] : undefined
  const situ = useJson<SituationsFile>(s ? `situations/${y}.json` : null)
  const avis = useJson<AvisDeptFile>(`avis/${dept}.json`).data
  const series = useJson<SeriesDeptFile>(s ? `series/dept/${dept}.json` : null).data
  // Noms des communes en casse normale (index des communes), le fichier départemental les écrivant en capitales.
  const noms = useMemo(() => {
    const m = new Map((index ?? []).map((e) => [e.c, e.n]))
    for (const [c, v] of Object.entries(file.data?.communes ?? {})) if (!m.has(c)) m.set(c, v.nom)
    return m
  }, [index, file.data])
  const nom = r?.nom?.trim() || code
  usePageTitle(r ? `Réseau ${nom} · eau du robinet` : null, r ? `Qualité de l'eau du réseau de distribution ${nom} (${code}) : conformité, analyses et communes desservies.` : null)

  // États d'erreur avec une issue (revue design du 2026-09-22) : cf. NotFound.tsx.
  if (file.error)
    return (
      <div className="page">
        <p className="muted">Département introuvable ({dept}).</p>
        <Search />
      </div>
    )
  if (!file.data || !params) return <Chargement />
  const nomDept = names.get(dept) ?? dept
  if (!r)
    return (
      <div className="page">
        <Crumbs items={[{ label: nomDept, to: `/departement/${dept}` }, { label: code }]} />
        <h1>Réseau {code}</h1>
        <p className="muted">Aucun réseau de distribution sous ce code.</p>
        <Search />
      </div>
    )

  const communes = y ? communesDuReseau(file.data, code, y) : []
  const reseaux: ReseauBulletin[] = [{ code, nom, situation: situ.data?.reseaux[code] ?? null }]
  const anneeEnCours = meta?.partiel?.length ? String(Math.max(...meta.partiel)) : undefined
  const choixSerie = y ? parametreSerie(reseaux[0].situation, s) : null
  const serie = choixSerie && series && y ? serieAnnee(series, code, choixSerie.parametre, y) : null

  return (
    <div className="page">
      <Crumbs items={[{ label: nomDept, to: `/departement/${dept}` }, { label: `Réseau ${nom}` }]} />
      <div className="page-head">
        <div>
          <p className="kind">Réseau de distribution</p>
          <h1 className="h1-udi">{nom}</h1>
          <p className="meta">
            code du réseau {code} · {nomDept}
            {communes.length > 0 && ` · dessert ${fmt.nb(communes.length, 'commune')} en ${y}`}
          </p>
        </div>
      </div>

      <AvisEnCours reseau={code} dept={dept} annee={y} anneeEnCours={anneeEnCours} />
      <BarreAnnee
        titre="Bilan de l’année"
        note="Le bulletin, les avis de l’ARS de l’année, la série mensuelle et le détail suivent l’année choisie."
        annees={anneesFiche(meta, years)}
        annee={y ? Number(y) : undefined}
        onChange={setShared}
      />

      {!s ? (
        <div className="cadre">
          <div className="etat-vide" role="status">
            <p>
              <b>
                Pas de prélèvement du contrôle sanitaire rattaché à ce réseau en {y}.
              </b>
            </p>
            {years.length > 0 && (
              <p>
                {years.length > 1 ? 'Années disponibles' : 'Année disponible'} :{' '}
                {[...years].reverse().map((a, i) => (
                  <Fragment key={a}>
                    {i > 0 && ', '}
                    <Link to={{ search: `?annee=${a}` }}>{a}</Link>
                  </Fragment>
                ))}
                .
              </p>
            )}
          </div>
        </div>
      ) : !situ.data && !situ.error ? (
        <Chargement />
      ) : (
        <>
          <div className="fiche-grid">
            <Bulletin
              question="L’eau de ce réseau est-elle conforme ?"
              annee={y!}
              reseaux={reseaux}
              stats={() => s}
              params={params.params}
              avis={avis ? groupesAvis(avisDuReseau(avis.communes, code), avis.textes, y!) : []}
              sansInfo={sansInfoBulletin(avis, [code], y!, (d) => names.get(d) ?? d)}
              comptes={comptes(s)}
            />
            <OuArrive dept={dept} annee={y!} communes={communes} noms={noms} dist={r.dist} uge={r.uge} />
          </div>

          {serie && choixSerie && <BlocSerie parametre={choixSerie.parametre} info={params.params[choixSerie.parametre]} reseau={nom} annee={y!} serie={serie} />}

          <ToutDeplier titre="Tout le détail" />
          <Section key={`analyses-${densite}`} id="analyses" titre="Analyses du contrôle sanitaire" resume="Dépassements de limite et paramètres clés du millésime" ouvert={densite === 'detaille'}>
            <QualityStats s={s} params={params} year={y!} />
          </Section>
          <Section key={`horsgrille-${densite}`} id="horsgrille" titre="Substances sans limite réglementaire" resume="Quantifiées mais non encadrées par une limite de qualité" ouvert={densite === 'detaille'}>
            <HorsGrilleCard s={s} params={params} year={y!} />
          </Section>
          <Section key={`mois-${densite}`} id="mois" titre="Mois par mois" resume={`Chaque paramètre suivi sur ce réseau en ${y}`} ouvert={densite === 'detaille'}>
            <SeriesAnnee dept={dept} reseaux={[code]} annee={y!} params={params} />
          </Section>
          <Section key={`familles-${densite}`} id="familles" titre="Répartition par famille de paramètres" resume="Analyses et dépassements, famille par famille" ouvert={densite === 'detaille'}>
            <RepartitionFamilles s={s} params={params} />
          </Section>
        </>
      )}
      <div className="source">Source : contrôle sanitaire SISE-Eaux, ministère chargé de la Santé, via data.gouv.fr ; services d’eau, observatoire SISPEA (OFB).</div>
    </div>
  )
}

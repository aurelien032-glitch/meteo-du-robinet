import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AvisEnCours from '../components/AvisEnCours'
import BandeRessource from '../components/BandeRessource'
import BlocSerie from '../components/BlocSerie'
import BarreAnnee from '../components/BarreAnnee'
import Bulletin from '../components/Bulletin'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import HorsGrilleCard from '../components/HorsGrilleCard'
import NappeCard from '../components/NappeCard'
import OrigineCard from '../components/OrigineCard'
import QualityStats from '../components/QualityStats'
import QuiDistribue from '../components/QuiDistribue'
import RepartitionFamilles from '../components/RepartitionFamilles'
import Search from '../components/Search'
import Section from '../components/Section'
import SeriesAnnee from '../components/SeriesAnnee'
import ServiceCard from '../components/ServiceCard'
import ToutDeplier from '../components/ToutDeplier'
import VigiEauCard from '../components/VigiEauCard'
import { groupesAvis, sansInfoBulletin } from '../lib/avis'
import { comptes, ordreReseaux, type ReseauBulletin } from '../lib/bulletin'
import { fmt } from '../lib/data'
import { useDensite } from '../lib/densite'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { parametreSerie, serieAnnee } from '../lib/serie'
import type { SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import { deptOfInsee, type AvisDeptFile, type CommuneIndexEntry, type DeptFile, type MetaFile, type ParamsFile, type SeriesDeptFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

/**
 * Fiche commune (maquette « vigilance + instruments » du 23/09), dans l'ordre du parcours de l'habitant : l'avis de
 * l'ARS en cours, qui ne dépend pas de l'année et porte sa date ; la barre d'année, au-dessus de tout ce qu'elle
 * gouverne ; le bulletin (« Puis-je boire l'eau du robinet ? ») ; le détail replié ; la ressource, qui reste affichée
 * quelle que soit l'année. Une année sans prélèvement le dit, au lieu de basculer en silence sur une autre.
 */
export default function Commune() {
  const { code = '' } = useParams()
  const dept = deptOfInsee(code)
  const file = useJson<DeptFile>(`dept/${dept}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const c = file.data?.communes[code]
  const meta = useJson<MetaFile>('meta.json').data
  const { names } = useDepartements()
  // Nom de la commune en casse normale (index des communes) : le contrôle sanitaire l'écrit en capitales
  // (« BORDEAUX »), ce qui jurait avec le reste du site (revue du 2026-09-22).
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const nom = index?.find((e) => e.c === code)?.n ?? c?.nom ?? code
  const years = c ? Object.keys(c.stats).sort() : []
  const [shared, setShared] = useYear(meta)
  const [densite] = useDensite()
  const y = shared != null ? String(shared) : years[years.length - 1]
  const s = y ? c?.stats[y] : undefined
  const situ = useJson<SituationsFile>(s ? `situations/${y}.json` : null)
  const avis = useJson<AvisDeptFile>(`avis/${dept}.json`).data
  const series = useJson<SeriesDeptFile>(s ? `series/dept/${dept}.json` : null).data
  // Réseau affiché par le bulletin : la série mensuelle en dessous suit l'onglet choisi.
  const [reseauChoisi, choisirReseau] = useState<string | null>(null)
  const nomDept = names.get(dept) ?? dept
  usePageTitle(c ? `${nom} (${dept}) · eau du robinet` : null, c ? `Qualité de l'eau du robinet à ${nom} : conformité, pesticides, nitrates, PFAS, service d'eau et restrictions sécheresse.` : null)

  // Constat sans issue → avec une issue (revue design du 2026-09-22) : cf. NotFound.tsx.
  if (file.error)
    return (
      <div className="page">
        <p className="muted">Département introuvable ({dept}).</p>
        <Search />
      </div>
    )
  if (!file.data || !params) return <Chargement />
  if (!c)
    return (
      <div className="page">
        <Crumbs items={[{ label: nomDept, to: `/departement/${dept}` }, { label: code }]} />
        <h1>Commune {code}</h1>
        <p className="muted">Aucune donnée de contrôle sanitaire pour ce code INSEE.</p>
        <Search />
      </div>
    )

  const reseauxInfo = file.data.reseaux
  const codes = (y && c.reseaux[y]) || []
  const reseaux: ReseauBulletin[] = codes.map((r) => ({ code: r, nom: reseauxInfo[r]?.nom ?? r, situation: situ.data?.reseaux[r] ?? null }))
  // Bordeaux est desservie par six réseaux de la même régie : on la nomme une fois (refonte du 2026-09-22).
  const exploitants = [...new Set(codes.map((r) => reseauxInfo[r]?.dist).filter((d): d is string => !!d))]
  const anneeEnCours = meta?.partiel?.length ? String(Math.max(...meta.partiel)) : undefined
  // Série mensuelle de l'année : celle qui explique le bulletin du réseau affiché (lib/serie.ts), s'il y en a une.
  const ordre = ordreReseaux(reseaux)
  const affiche = ordre.find((r) => r.code === reseauChoisi) ?? ordre[0]
  const choixSerie = affiche && y ? parametreSerie(affiche.situation, reseauxInfo[affiche.code]?.stats?.[y]) : null
  const serie = choixSerie && series && y ? serieAnnee(series, affiche!.code, choixSerie.parametre, y) : null

  return (
    <div className="page">
      <Crumbs items={[{ label: nomDept, to: `/departement/${dept}` }, { label: nom }]} />
      <div className="page-head">
        <div>
          <p className="kind">Commune</p>
          <h1>{nom}</h1>
          <p className="meta">
            {nomDept} · code INSEE {code}
            {codes.length > 0 && ` · desservie par ${fmt.nb(codes.length, 'réseau', 'réseaux')} en ${y}`}
          </p>
        </div>
        <Link to={`/commune/${code}/analyses`} className="btn">
          Toutes les analyses réglementaires
        </Link>
      </div>

      <AvisEnCours insee={code} dept={dept} annee={y} anneeEnCours={anneeEnCours} />
      <BarreAnnee
        titre="Bilan de l’année"
        note="Le bulletin, les avis de l’ARS de l’année et le détail suivent l’année choisie."
        annees={anneesFiche(meta, years)}
        annee={y ? Number(y) : undefined}
        onChange={setShared}
      />

      {!s ? (
        <div className="cadre">
          <div className="etat-vide" role="status">
            <p>
              <b>
                Pas de prélèvement du contrôle sanitaire à {nom} en {y}.
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
              question="Puis-je boire l’eau du robinet ?"
              annee={y!}
              reseaux={reseaux}
              stats={(r) => reseauxInfo[r]?.stats?.[y!]}
              params={params.params}
              avis={avis ? groupesAvis(avis.communes[code] ?? [], avis.textes, y!) : []}
              sansInfo={sansInfoBulletin(avis, codes, y!, (d) => names.get(d) ?? d)}
              comptes={comptes(s)}
              choisi={reseauChoisi}
              surChoix={choisirReseau}
            />
            <QuiDistribue insee={code} dept={dept} annee={y!} reseaux={reseaux} exploitants={exploitants} />
          </div>

          {serie && affiche && choixSerie && (
            <BlocSerie
              parametre={choixSerie.parametre}
              info={params.params[choixSerie.parametre]}
              reseau={affiche.nom.trim()}
              annee={y!}
              serie={serie}
              precision={codes.length > 1 ? ', celui qu’affiche le bulletin' : ''}
            />
          )}

          <ToutDeplier titre="Tout le détail" />
          <Section key={`analyses-${densite}`} id="analyses" titre="Analyses du contrôle sanitaire" resume="Dépassements de limite et paramètres clés du millésime" ouvert={densite === 'detaille'}>
            <QualityStats s={s} params={params} year={y!} />
          </Section>
          <Section key={`horsgrille-${densite}`} id="horsgrille" titre="Substances sans limite réglementaire" resume="Quantifiées mais non encadrées par une limite de qualité" ouvert={densite === 'detaille'}>
            <HorsGrilleCard s={s} params={params} year={y!} />
          </Section>
          <Section key={`mois-${densite}`} id="mois" titre="Mois par mois" resume={`Chaque paramètre suivi sur les réseaux de la commune en ${y}`} ouvert={densite === 'detaille'}>
            <SeriesAnnee dept={dept} reseaux={codes} annee={y!} params={params} />
          </Section>
          <Section key={`service-${densite}`} id="service" titre="Le service qui distribue l'eau" resume="Prix du m³, rendement du réseau, renouvellement des canalisations" ouvert={densite === 'detaille'}>
            <ServiceCard insee={code} dept={dept} year={y} />
          </Section>
          <Section key={`familles-${densite}`} id="familles" titre="Répartition par famille de paramètres" resume="Analyses et dépassements, famille par famille" ouvert={densite === 'detaille'}>
            <RepartitionFamilles s={s} params={params} />
          </Section>
        </>
      )}

      {/* La ressource ne dépend pas de l'année du contrôle sanitaire : elle reste affichée, même sans prélèvement. */}
      <Section key={`origine-${densite}`} id="origine" titre="D'où vient l'eau" resume="Captages, nature de la ressource et traitements" ouvert={densite === 'detaille'}>
        <OrigineCard insee={code} dept={dept} />
      </Section>
      <Section key={`secheresse-${densite}`} id="secheresse" titre="Sécheresse" resume="Restrictions d'usage en vigueur sur la commune" ouvert={densite === 'detaille'}>
        <VigiEauCard insee={code} />
      </Section>
      <Section key={`nappe-${densite}`} id="nappe" titre="Les nappes du secteur" resume="Nitrates et pesticides mesurés dans les eaux souterraines" ouvert={densite === 'detaille'}>
        <NappeCard insee={code} dept={dept} />
      </Section>
      <BandeRessource insee={code} dept={dept} />
      <div className="source">
        Sources : contrôle sanitaire SISE-Eaux (ministère chargé de la Santé, via data.gouv.fr) ; services d’eau, observatoire SISPEA (OFB) ;
        ouvrages de prélèvement (BNPE), nappes (ADES, Hub’Eau) et restrictions sécheresse (VigiEau).
      </div>
    </div>
  )
}

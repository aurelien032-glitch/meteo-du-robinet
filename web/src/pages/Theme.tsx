import { useCallback, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chargement from '../components/Chargement'
import Chart, { axisDefaults, partielItemStyle } from '../components/Chart'
import Crumbs from '../components/Crumbs'
import FranceMap from '../components/FranceMap'
import MapLegend from '../components/MapLegend'
import MonthlySeries from '../components/MonthlySeries'
import Section from '../components/Section'
import { AvisDeLaCarte, BarreClasses, ChiffreCarte, dateMoment, MesureSujet, RechercheSujet, ReseauxParDepartement } from '../components/Sujet'
import TableauDeptsTri, { type Colonne } from '../components/TableauDeptsTri'
import ToutDeplier from '../components/ToutDeplier'
import { pctCarte } from '../lib/carte'
import { EFFECTIF_MIN, reseauxParDept } from '../lib/classement'
import { fmt } from '../lib/data'
import { useDensite } from '../lib/densite'
import { useDepartements } from '../lib/geo'
import { useJson } from '../lib/hooks'
import { libelleParametre } from '../lib/parametres'
import { communesTheme, lienDepartement, sujetTheme } from '../lib/parcours'
import { qualiteScale } from '../lib/scale'
import {
  CANALISATIONS,
  classesNonConformes,
  couleursSituation,
  detailSituation,
  estPartiel,
  familleDuTheme,
  libelleClasse,
  libellesSituation,
  nbClasses,
  type FamilleSitu,
  type SituationsFile,
} from '../lib/situations'
import {
  bilanFamille,
  bilanReferences,
  DEF_ANALYSE,
  DEF_COMPTE,
  entetesCsvSujet,
  ligneCsvSujet,
  lignesReferences,
  lignesSujet,
  limitesFamille,
  PAGES_THEMES,
  phraseAvisCause,
  POUR_FAMILLE,
  titreBilanFamille,
  titreBilanReferences,
  tonCommun,
  type LigneSujet,
} from '../lib/sujets'
import { chartPalette, useCleTheme } from '../lib/theme'
import { usePageTitle } from '../lib/title'
import { bilanDe, defaultYear, yearLabel, type AvisNationalFile, type MetaFile, type ParamsFile, type SeriesIndexEntry, type ThemeFile } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'
import SectionTfa from '../components/SectionTfa'

type Famille = Exclude<FamilleSitu, 'toutes' | 'autres'>

/** Période d'une année : « depuis le 1er janvier 2026 » pour l'année en cours, sinon « en 2025 ». */
const periodeDe = (a: string) => (estPartiel(a) ? `depuis le 1er janvier ${a}` : `en ${a}`)

/**
 * Carte « En ce moment » d'une famille (refonte, lot 4) : réseaux en cause dans l'année en cours (situations/national.json,
 * méthode de la famille), avis de l'ARS qui citent cette cause, date d'arrêt et départements « sans information ».
 */
function MomentFamille({ fam, slug, annee, national, avis }: { fam: Famille; slug: string; annee: string; national: Record<string, SituationsFile['national']> | null; avis: AvisNationalFile | null }) {
  const b = bilanFamille(national?.[annee]?.[fam], fam, annee)
  const periode = periodeDe(annee)
  return (
    <section className="carte-fiche accueil-carte" aria-labelledby="t-moment">
      <div className="cf-tete">
        <p className="cf-sur">En ce moment</p>
        <p className="cf-date">{dateMoment(annee, avis)}</p>
      </div>
      <h2 className="cf-grand-titre" id="t-moment">
        Réseaux en cause {periode}
      </h2>
      {!national ? (
        <Chargement texte="Chargement…" />
      ) : !b || !b.analyses ? (
        <p className="cf-texte">Aucun réseau n’a été analysé pour {POUR_FAMILLE[fam]} {periode}.</p>
      ) : (
        <>
          <ChiffreCarte
            n={b.nonConformes || null}
            ton={tonCommun(fam, classesNonConformes(fam), b.nonConformes)}
            texte={
              b.nonConformes
                ? `${b.nonConformes > 1 ? 'réseaux' : 'réseau'} sur ${fmt.int(b.analyses)} analysés pour ${POUR_FAMILLE[fam]}.`
                : `Aucun réseau en cause, sur ${fmt.nb(b.analyses, 'réseau analysé', 'réseaux analysés')} pour ${POUR_FAMILLE[fam]}.`
            }
          />
          <p className="cap">{DEF_COMPTE[fam]}</p>
        </>
      )}
      <AvisDeLaCarte phrase={phraseAvisCause(avis?.causes[annee], slug, periode)} avis={avis} annee={annee} />
      <p className="cf-liens">
        <Link to={{ search: `?annee=${annee}`, hash: '#carte' }}>Voir la carte {estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `de ${annee}`}</Link>
      </p>
    </section>
  )
}

/** Carte « Bilan <dernière année complète> » d'une famille : réseaux analysés, répartition selon les classes de son bilan. */
function BilanTheme({ fam, annee, national }: { fam: Famille; annee: string; national: Record<string, SituationsFile['national']> | null }) {
  const b = bilanFamille(national?.[annee]?.[fam], fam, annee)
  return (
    <section className="carte-fiche accueil-carte" aria-labelledby="t-bilan-sujet">
      <div className="cf-tete">
        <p className="cf-sur">{bilanDe(annee, estPartiel(annee))}</p>
        {b && <p className="cf-date">{fmt.nb(b.analyses, 'réseau analysé', 'réseaux analysés')}</p>}
      </div>
      <h2 className="cf-grand-titre" id="t-bilan-sujet">
        {b ? titreBilanFamille(b) : bilanDe(annee, estPartiel(annee))}
      </h2>
      {!national ? (
        <Chargement texte="Chargement du bilan…" />
      ) : !b ? (
        <p className="cf-texte">Aucun réseau n’a été analysé pour {POUR_FAMILLE[fam]} {estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`}.</p>
      ) : (
        <>
          <BarreClasses
            valeurs={b.classes.map((c) => c.n)}
            tons={b.classes.map((c) => c.ton)}
            texte={`Répartition des ${fmt.int(b.analyses)} réseaux analysés ${estPartiel(annee) ? `depuis le 1er janvier ${annee}` : `en ${annee}`} : ${b.classes.map((c) => `${c.libelle}, ${fmt.int(c.n)}`).join(' ; ')}`}
          />
          <ul className="sujet-classes">
            {b.classes.map((c, i) => (
              <li key={c.classe}>
                <span className="swatch" style={{ background: couleursSituation(fam)[i] }} aria-hidden="true" />
                <span>
                  {c.libelle}
                  {c.nonConforme && <span className="sr-only"> (non conforme)</span>}
                </span>
                <span className="sc-nb">{fmt.int(c.n)}</span>
                <span className="sc-part">{fmt.pct(100 * c.part, 1)}</span>
              </li>
            ))}
          </ul>
          <p className="cap">
            {DEF_ANALYSE} {DEF_COMPTE[fam]}
            {fam === 'pfas' && ' Avant 2026, la recherche des PFAS n’était pas systématique : les réseaux analysés sont moins nombreux les années précédentes.'}
          </p>
        </>
      )}
      <p className="cf-liens">
        <Link to="/methode#familles">Méthode de chaque famille</Link>
      </p>
    </section>
  )
}

/**
 * Cartes de la radioactivité : références de qualité, jamais « non conforme ». `partie` : « En ce moment » (année en
 * cours) avant la barre d'année, le bilan (année de la barre) après elle.
 */
function CartesReferences({ t, enCours, anneeBilan, avis, partie }: { t: ThemeFile; enCours: string; anneeBilan: string; avis: AvisNationalFile | null; partie: 'moment' | 'bilan' }) {
  const m = bilanReferences(t.national[enCours])
  const b = bilanReferences(t.national[anneeBilan])
  const periode = periodeDe(enCours)
  if (partie === 'moment')
    return (
      <section className="carte-fiche accueil-carte" aria-labelledby="t-moment">
        <div className="cf-tete">
          <p className="cf-sur">En ce moment</p>
          <p className="cf-date">{dateMoment(enCours, avis)}</p>
        </div>
        <h2 className="cf-grand-titre" id="t-moment">
          Réseaux au-dessus d’une référence {periode}
        </h2>
        {m ? (
          <ChiffreCarte n={m.auDessus} texte={`${m.auDessus > 1 ? 'réseaux' : 'réseau'} sur ${fmt.int(m.analyses)} analysés ont au moins une analyse au-dessus d’une référence de qualité.`} />
        ) : (
          <p className="cf-texte">Aucune analyse de radioactivité n’est publiée {periode}.</p>
        )}
        <AvisDeLaCarte phrase={phraseAvisCause(avis?.causes[enCours], 'radioactivite', periode)} avis={avis} annee={enCours} />
      </section>
    )
  return (
      <section className="carte-fiche accueil-carte" aria-labelledby="t-bilan-sujet">
        <div className="cf-tete">
          <p className="cf-sur">{bilanDe(anneeBilan, estPartiel(anneeBilan))}</p>
          {b && <p className="cf-date">{fmt.nb(b.analyses, 'réseau analysé', 'réseaux analysés')}</p>}
        </div>
        <h2 className="cf-grand-titre" id="t-bilan-sujet">
          {b ? titreBilanReferences(b) : bilanDe(anneeBilan, estPartiel(anneeBilan))}
        </h2>
        {b && <p className="cf-texte">{fmt.nb(b.auDessus, 'réseau a', 'réseaux ont')} au moins une analyse au-dessus d’une référence de qualité.</p>}
        <p className="cap">Une référence de qualité est une valeur indicative, sans caractère obligatoire ; son dépassement ne constitue pas une non-conformité.</p>
      </section>
  )
}

/**
 * Page d'un sujet (refonte, lot 4, règles de l'auteur du 2026-10-05) : ce que mesure le contrôle sanitaire, d'après les
 * textes cités ; la recherche d'une commune ; « En ce moment » (année en cours) ; puis la barre d'année, qui gouverne le
 * bilan, la carte des départements et son tableau (une seule année par page, parcours du 2026-10-06), alphabétique avec tri au choix ; les réseaux concernés département par
 * département ; l'évolution et les substances ; les sources. Aucun palmarès, aucune recommandation sanitaire.
 */
export default function Theme() {
  const cle = useCleTheme()
  const { slug = '' } = useParams()
  const th = useJson<ThemeFile>(`themes/${slug}.json`)
  const params = useJson<ParamsFile>('params.json').data
  const { deps, names } = useDepartements()
  const meta = useJson<MetaFile>('meta.json').data
  const avis = useJson<AvisNationalFile>('avis/national.json').data
  const t = th.data
  const page = PAGES_THEMES[slug]
  const titre = page?.titre ?? t?.titre ?? null
  usePageTitle(titre, page?.description ?? t?.question ?? null)
  const years = useMemo(() => (t ? Object.keys(t.national).sort() : []), [t])
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setYear] = useYear(meta)
  const [densite] = useDensite()
  const last = y != null && years.includes(String(y)) ? String(y) : years[years.length - 1]
  const [survol, setSurvol] = useState<string | null>(null)
  const [sp, setSp] = useSearchParams()

  const fam = t ? (familleDuTheme(t.famille) as Famille | null) : null
  const refs = !!t && !fam
  const situ = useJson<SituationsFile>(t && last ? `situations/${last}.json` : null).data
  const serieSitu = useJson<Record<string, SituationsFile['national']>>('situations/national.json').data
  const enCours = String(defaultYear(meta) ?? '')
  // Le bilan suit la barre d'année, comme la carte et le tableau : une seule année par page (parcours, 2026-10-06 ; il
  // restait sur l'année en cours quand le visiteur choisissait une autre année).
  const anneeBilan = last ?? ''
  const nonConf = refs ? 'au-dessus d’une référence de qualité' : 'non conformes'

  // Paramètre de la série mensuelle (?param=), parmi les séries de la famille ; ni plomb, ni cuivre, ni nickel pour les
  // métaux et minéraux, écartés du jugement (page « Plomb et canalisations »).
  const seriesIndex = useJson<SeriesIndexEntry[]>('series/index.json').data
  const exclus = useMemo(() => new Set<string>(slug === 'metaux' ? CANALISATIONS : []), [slug])
  const choix = useMemo(() => (seriesIndex ?? []).filter((e) => t && (e.f === t.famille || e.code === t.param_cle) && !exclus.has(e.code)), [seriesIndex, t, exclus])
  const paramDefaut = choix.some((e) => e.code === t?.param_cle) ? (t?.param_cle ?? '') : (choix.find((e) => e.k)?.code ?? choix[0]?.code ?? '')
  const paramUrl = sp.get('param')
  const param = paramUrl && choix.some((e) => e.code === paramUrl) ? paramUrl : paramDefaut
  const setParam = (code: string) => {
    const next = new URLSearchParams(sp)
    if (code === paramDefaut) next.delete('param')
    else next.set('param', code)
    setSp(next, { replace: true })
  }

  const avecContour = useMemo(() => new Set((deps?.features ?? []).map((f) => String(f.properties?.code))), [deps])
  const nom = useCallback((dd: string) => names.get(dd) ?? dd, [names])
  const garder = useCallback((dd: string) => avecContour.size === 0 || avecContour.has(dd), [avecContour])
  const totaux = useMemo(() => reseauxParDept(situ), [situ])
  const lignes = useMemo<LigneSujet[]>(() => {
    if (!t || !last) return []
    if (fam) return lignesSujet(situ, fam, nom, detailSituation(fam).classes, garder)
    return situ ? lignesReferences(t, last, nom, totaux, garder) : []
  }, [t, last, fam, situ, nom, garder, totaux])
  const parDept = useMemo(() => new Map(lignes.map((l) => [l.dd, l])), [lignes])

  const scale = useMemo(() => qualiteScale(), [cle])
  const colorOf = useCallback((p: Record<string, unknown>) => scale.color(parDept.get(String(p.code))?.part ?? null), [parDept, scale])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = parDept.get(String(p.code))
      if (!v || v.part == null) return `<b>${p.nom}</b> (${p.code})<br>pas de donnée`
      const lignesInfo = v.r && fam ? Array.from({ length: nbClasses(fam) }, (_, i) => `${fmt.int(v.r![i])} ${libelleClasse(fam, i, last)}`).join('<br>') : ''
      return `<b>${p.nom}</b> (${p.code})<br>${pctCarte(v.part)} des réseaux ${nonConf} (${fmt.int(v.comptes)} sur ${fmt.int(v.analyses)})${lignesInfo ? `<br><span class="muted">${lignesInfo}</span>` : ''}`
    },
    [parDept, fam, nonConf, last],
  )

  // Hauteur du graphique des substances : 40 px par barre plus les axes (2 barres occupaient 360 px fixes).
  const hauteurSubstances = useMemo(() => {
    if (!t) return 360
    const val = (r: ThemeFile['params'][number]) => (refs ? (r.nr ?? 0) : r.nd)
    const n = t.params.filter((r) => val(r) > 0 && !/^(total|somme)\b/i.test(r.l ?? '') && !exclus.has(r.p)).slice(0, 12).length
    return Math.max(160, n * 40 + 60)
  }, [t, refs, exclus])

  const paramsOption = useMemo(() => {
    if (!t) return null
    const p = chartPalette()
    // Les sommes (« Total des pesticides analysés ») ne sont pas des substances ; sans limite de qualité (radioactivité),
    // les dépassements de référence. Métaux et minéraux : sans le plomb, le cuivre et le nickel, écartés du jugement.
    const val = (r: ThemeFile['params'][number]) => (refs ? (r.nr ?? 0) : r.nd)
    const seuil = refs ? 'de la référence' : 'de la limite'
    const rows = t.params.filter((r) => val(r) > 0 && !/^(total|somme)\b/i.test(r.l ?? '') && !exclus.has(r.p)).slice(0, 12)
    const narrow = window.innerWidth < 700
    const ax = axisDefaults()
    return {
      grid: { left: narrow ? 130 : 230, right: 60, top: 8, bottom: 44 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => `${fmt.int(Number(v))} analyses au-dessus ${seuil}` },
      xAxis: { type: 'value' as const, ...ax, name: `analyses au-dessus ${seuil}`, nameLocation: 'middle' as const, nameGap: 26, axisLabel: { ...ax.axisLabel, hideOverlap: true, formatter: (v: number) => fmt.int(v) } },
      // Noms entiers, sur deux lignes au besoin (audit mobile du 2026-10-06 : 7 noms sur 12 tronqués à 118 px).
      yAxis: { type: 'category' as const, inverse: true, data: rows.map((r) => libelleParametre(r.p, r.l)), ...ax, axisLabel: { color: p.text, width: narrow ? 118 : 220, overflow: 'break' as const, lineHeight: 14 } },
      series: [{ type: 'bar' as const, name: 'Dépassements', data: rows.map(val), itemStyle: { color: p.alerte, borderRadius: [0, 4, 4, 0] }, barMaxWidth: 22, label: { show: true, position: 'right' as const, color: p.text, formatter: (x: { value: unknown }) => fmt.int(Number(x.value)) } }],
    }
  }, [t, cle, refs, exclus])

  const yearsOption = useMemo(() => {
    if (!t || years.length < 2 || !fam || !serieSitu) return null
    const p = chartPalette()
    // Sur téléphone, la légende tient sur trois lignes : le tracé commence dessous (audit mobile du 2026-10-06).
    const etroit = window.innerWidth < 600
    const partiel = new Set(meta?.partiel ?? [])
    const couleurs = couleursSituation(fam)
    const classes = classesNonConformes(fam)
    const noms = libellesSituation(fam)
    const item = (an: string, v: number | null | undefined, i: number) =>
      partiel.has(Number(an)) ? { value: v ?? null, itemStyle: { ...partielItemStyle(), color: couleurs[i] } } : (v ?? null)
    return {
      grid: { left: 60, right: 20, top: etroit ? 96 : 40, bottom: etroit ? 44 : 28 },
      tooltip: { trigger: 'axis' as const, valueFormatter: (v: unknown) => (v == null ? '–' : `${fmt.int(Number(v))} réseaux`) },
      legend: { top: 0, type: 'plain' as const, textStyle: { color: p.muted, fontSize: p.fontSize } },
      xAxis: {
        type: 'category' as const,
        data: years.map((an) => yearLabel(meta, an)),
        ...axisDefaults(),
        // Toutes les années, « 2026 » et « (en cours) » sur deux lignes en largeur étroite.
        axisLabel: { ...axisDefaults().axisLabel, interval: 0, formatter: (v: string) => (etroit ? v.replace(' (', '\n(') : v) },
      },
      yAxis: { type: 'value' as const, name: 'réseaux', ...axisDefaults(), axisLabel: { ...axisDefaults().axisLabel, formatter: (v: number) => fmt.int(v) } },
      series: classes.map((i) => ({
        type: 'bar' as const,
        stack: 'nc',
        name: noms[i],
        data: years.map((an) => item(an, serieSitu[an]?.[fam]?.[i], i)),
        itemStyle: { color: couleurs[i] },
        barMaxWidth: 40,
      })),
    }
  }, [t, years, meta, fam, serieSitu, cle])

  const colonnes = useMemo<Colonne<LigneSujet>[]>(() => {
    const cols: Colonne<LigneSujet>[] = [
      {
        cle: 'part',
        titre: refs ? 'Part au-dessus d’une référence' : 'Part non conforme',
        quoi: refs ? 'la part des réseaux au-dessus d’une référence de qualité' : 'la part des réseaux non conformes',
        num: true,
        valeur: (l) => l.part,
        classable: (l) => l.classable,
        cellule: (l) => (l.part == null ? '–' : pctCarte(l.part)),
      },
      {
        cle: 'reseaux',
        titre: refs ? 'Réseaux au-dessus / analysés' : 'Non conformes / analysés',
        num: true,
        cellule: (l) => (
          <>
            {fmt.int(l.comptes)} sur {fmt.int(l.analyses)}
            {!l.classable && (
              <span className="muted">
                {' '}
                <abbr title={`Part calculée sur moins de ${EFFECTIF_MIN} réseaux analysés : hors des tris`}>(hors tri)</abbr>
              </span>
            )}
          </>
        ),
      },
    ]
    if (fam)
      cols.push({ cle: 'detail', titre: detailSituation(fam).titre, num: true, classe: 'col-lettre', cellule: (l) => fmt.int(l.detail) })
    return cols
  }, [refs, fam])

  if (th.error)
    return (
      <div className="page">
        <p className="muted">Sujet introuvable.</p>
        <Link to="/themes">Voir tous les sujets →</Link>
      </div>
    )
  if (!t || !params || !meta || !last) return <Chargement reserve />
  const anneeMap = Number(last)
  const partielMap = estPartiel(last)
  const periodeMap = partielMap ? `depuis le 1er janvier ${last}` : `en ${last}`
  const nomTitre = titre ?? t.titre
  const limites = slug === 'metaux' ? limitesFamille(t.params, params.params) : []

  return (
    <div className="page sujet">
      <p className="eyebrow">Sujets</p>
      <Crumbs items={[{ label: 'Sujets', to: '/themes' }, { label: nomTitre }]} />
      <h1>{nomTitre}</h1>

      <div className="sujet-tete">
        <MesureSujet
          sujet={slug}
          apres={
            limites.length > 0 && (
              <p>
                Limites de qualité des paramètres de cette famille les plus souvent analysés, telles qu’elles figurent dans le contrôle sanitaire : {limites.join(' ; ')}.
              </p>
            )
          }
        />
        <RechercheSujet />
      </div>

      {fam ? (
        <MomentFamille fam={fam} slug={slug} annee={enCours} national={serieSitu} avis={avis} />
      ) : (
        <CartesReferences t={t} enCours={enCours} anneeBilan={anneeBilan} avis={avis} partie="moment" />
      )}

      <section id="carte" className="sujet-carte" aria-labelledby="t-carte-sujet">
        <h2 id="t-carte-sujet">Bilan de l’année, par département</h2>
        <BarreAnnee
          titre="Année du bilan"
          note={`Elle vaut pour le bilan, la carte, le tableau des départements${fam ? ' et la liste des réseaux concernés' : ''} ci-dessous ; « En ce moment » porte sur l’année en cours.`}
          annees={anneesFiche(meta, years)}
          annee={anneeMap}
          onChange={setYear}
        />
        {fam ? (
          <BilanTheme fam={fam} annee={anneeBilan} national={serieSitu} />
        ) : (
          <CartesReferences t={t} enCours={enCours} anneeBilan={anneeBilan} avis={avis} partie="bilan" />
        )}
        <div className="france-deux">
          <section className="carte-fiche" aria-labelledby="t-carte-depts">
            <h3 className="cf-grand-titre" id="t-carte-depts">
              {refs ? 'Réseaux au-dessus d’une référence de qualité' : 'Réseaux non conformes'} {periodeMap}
            </h3>
            <div>
              <FranceMap
                data={deps && situ ? deps : null}
                colorOf={colorOf}
                labelOf={labelOf}
                encart={(dd) => ({ fiche: lienDepartement(dd, sujetTheme(slug)), communes: communesTheme(dd, slug) })}
                onHover={(p) => setSurvol(p ? String(p.code) : null)}
                selected={survol}
                height="min(520px, 110vw)"
                ariaLabel={`Carte des départements : part des réseaux de distribution ${nonConf}, ${periodeMap}. Le tableau voisin en donne une version textuelle.`}
              />
              <MapLegend
                desc={
                  fam === 'microbio'
                    ? 'part des réseaux à plus de 5 % de prélèvements non conformes en bactériologie, ou sous consigne de l’ARS'
                    : refs
                      ? 'part des réseaux avec au moins une analyse au-dessus d’une référence de qualité (valeur indicative, distincte d’une limite de qualité)'
                      : 'part des réseaux non conformes selon la méthode du bilan de la famille'
                }
                scale={scale}
                format={fmt.pctBorne}
              />
            </div>
            <p className="cap">Un clic sur un département mène à sa fiche.</p>
          </section>
          <section className="carte-fiche" aria-labelledby="t-tableau-depts">
            <h3 className="cf-grand-titre" id="t-tableau-depts">
              Les départements
            </h3>
            <p className="cf-texte">Par ordre alphabétique ; un tri par part est proposé. La part dépend notamment de l’origine de l’eau et du nombre de réseaux de chaque département.</p>
            {situ ? (
              <TableauDeptsTri
                lignes={lignes}
                colonnes={colonnes}
                lien={(dd) => lienDepartement(dd, sujetTheme(slug))}
                legende={`Les départements, par ordre alphabétique ou selon le tri choisi : part des réseaux ${nonConf} ${periodeMap}, puis effectifs`}
                selection={survol}
                onSurvol={setSurvol}
                csv={{
                  sujet: slug,
                  annee: last,
                  entetes: entetesCsvSujet(fam, last),
                  ligne: (l) => ligneCsvSujet(l, fam, last),
                  note: fam ? 'Tous les départements du tableau, avec les réseaux de chaque classe ; séparateur point-virgule.' : 'Tous les départements du tableau ; séparateur point-virgule.',
                }}
              />
            ) : (
              <Chargement texte="Chargement des départements…" />
            )}
          </section>
        </div>
        {fam && (
          <ReseauxParDepartement
            fam={fam}
            situ={situ}
            annee={anneeMap}
            departements={lignes.map((l) => [l.dd, l.nom] as [string, string])}
            nomFamille={POUR_FAMILLE[fam]}
            note={fam === 'azote' ? 'La liste comprend aussi les réseaux dont le maximum de l’année est compris entre 40 et 50 mg/L, conformes, comme la carte des communes.' : undefined}
          />
        )}
      </section>

      {slug === 'pfas' && <SectionTfa meta={meta} annee={anneeBilan} />}

      <ToutDeplier />
      <Section key={`graphiques-${densite}`} id="graphiques" titre={refs ? "Paramètres et suivi mensuel" : "Évolution et substances"} resume={refs ? "Paramètres le plus souvent au-dessus d’une référence de qualité, et suivi mensuel" : "Évolution par année, substances le plus souvent au-dessus de la limite, et suivi mensuel"} ouvert>
        {/* Deux graphiques sur une grille commune (titre, introduction, graphique, source alignés), le suivi mensuel en
            pleine largeur dessous (auteur, 2026-10-05, « alignement des graphiques »). */}
        <div className="graphiques-sujet">
          {yearsOption && (
            <div className="card">
              <h2>Réseaux non conformes par année</h2>
              <p className="muted">Nombre de réseaux par situation, de {years[0]} à {years[years.length - 1]}.</p>
              <Chart option={yearsOption} height={360} exportName={`evolution-${slug}`} />
              <div className="source">
                Nombre de réseaux de distribution par situation dans l’année, établi selon la méthode des bilans du ministère chargé de la Santé. Ces bilans pondèrent en
                outre les réseaux par la population desservie, donnée qui n’est pas publiée. L’année en cours, en barres hachurées, est incomplète et n’est donc pas
                comparable aux autres.
              </div>
            </div>
          )}
          <div className="card">
            <h2>{refs ? 'Paramètres le plus souvent au-dessus d’une référence' : 'Substances le plus souvent au-dessus de la limite'}</h2>
            <p className="muted">
              Nombre d’analyses au-dessus {refs ? 'd’une référence de qualité' : 'de la limite de qualité'}, cumulé de {years[0]} à {years[years.length - 1]}. Les
              sommes de substances ne sont pas prises en compte.
              {slug === 'metaux' && ' Le plomb, le cuivre et le nickel figurent sur la page « Plomb et canalisations ».'}
            </p>
            {paramsOption && <Chart option={paramsOption} height={hauteurSubstances} exportName={`substances-${slug}`} />}
          </div>
          <div className="card graphiques-plein">
            <div className="card-head">
              <h2>Mois par mois</h2>
              {choix.length > 1 && (
                <label>
                  Paramètre{' '}
                  <select value={param} onChange={(e) => setParam(e.target.value)}>
                    {choix.map((e) => (
                      <option key={e.code} value={e.code}>
                        {e.k ?? libelleParametre(e.code, e.l)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {param && <MonthlySeries code={param} height={400} />}
          </div>
        </div>
      </Section>

      <footer className="france-pied">
        <p>
          Sources et méthode : <Link to="/methode#familles">méthode de chaque famille</Link> · <Link to="/methode#classe-ars">notes A à D</Link> ·{' '}
          <Link to="/methode#hors-jugement">résultats hors du jugement</Link> · <Link to="/methode#classements">règle des classements</Link> ·{' '}
          <Link to="/methode#hors-grille">substances sans limite</Link>
        </p>
        <p className="source">
          Source : contrôle sanitaire de l’eau potable (SISE-Eaux, ministère chargé de la Santé, agences régionales de santé), calcul du site ; conclusions de l’ARS
          pour les avis. Contours : Etalab / IGN Admin Express.
        </p>
      </footer>
    </div>
  )
}

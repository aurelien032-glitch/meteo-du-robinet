import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chargement from '../components/Chargement'
import Crumbs, { echelleFrance } from '../components/Crumbs'
import Signalement from '../components/Signalement'
import { signalementActif } from '../lib/signalement'
import ReseauxService from '../components/ReseauxService'
import { accord, fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson, useJsonAll } from '../lib/hooks'
import { NBSP } from '../lib/instruments'
import { anneeMediane, deptsDuService, INDICATEURS_SERVICE, lignesReseauxService, phraseNotesReseaux, reseauxDuService, routageService, totauxReseaux } from '../lib/service'
import { descriptionService, nomService, titreService } from '../lib/prerendu'
import { libelleMode, modeGestion, renseigne } from '../lib/sispea'
import type { SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import { periodeAnnee, type CommuneIndexEntry, type DeptFile, type MetaFile, type SispeaNationalFile, type SispeaServicesFile, type SispeaServicesIndex } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

/** Au-delà, la liste des communes se replie (maquette du 23/09). */
const COMMUNES_DEPLIEES = 24

/**
 * Fiche service d'eau (maquette « vigilance + instruments » du 23/09). D'abord le service tel qu'il se déclare à la
 * SISPEA, daté, face à la médiane France et sans « mieux / moins bien » ; puis la barre d'année et, sous elle, ses
 * réseaux de l'année (l'agrégat en une phrase, au voyant du réseau le plus défavorable, puis chaque réseau avec son
 * voyant) ; enfin ses communes.
 * Le contrôle sanitaire se lit par réseau, la SISPEA rattache des communes (lib/service.ts).
 */
export default function Service() {
  const { id = '' } = useParams()
  const routage = routageService(useJson<SispeaServicesIndex>('sispea/services-index.json').data, id)
  const services = useJson<SispeaServicesFile>(routage.etat === 'fichier' ? routage.chemin : null).data
  const { names: deptNames } = useDepartements()
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  // Année en cours par défaut, sur toutes les pages (auteur, 2026-10-06 : « le but c'est d'abord de savoir ce qu'il se passe
  // actuellement ») ; les années complètes restent dans la barre « Année du bilan ».
  const [y, setY] = useYear(meta)
  const s = services?.[id]
  const situ = useJson<SituationsFile>(y ? `situations/${y}.json` : null).data
  const names = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const deptDe = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.d])), [index])
  // Les hooks qui suivent restent AVANT les `return` anticipés ci-dessous : un hook placé après un retour
  // conditionnel n'est appelé que sur certains rendus, ce qui a fait planter la page entière (React #310,
  // « rendered more hooks than during the previous render ») lors de l'audit du 2026-09-22.
  const communesService = s?.communes
  // Réseaux qui desservent les communes du service (unité des bilans officiels, cf. CLAUDE.md, et unité de compte des
  // prélèvements, cf. lib/service.ts). Un réseau n'est décrit que dans le fichier de son département : il faut ceux
  // de toutes les communes du service, pas seulement celui du service.
  const depts = useMemo(() => deptsDuService(communesService ?? [], deptDe), [communesService, deptDe])
  const fichiers = useJsonAll<DeptFile>(depts.map((d) => `dept/${d}.json`)).data
  // null tant qu'un fichier manque ; liste vide quand il n'y a rien à charger (8 services dont aucune commune
  // n'est suivie par le contrôle sanitaire, comme Beon) — sans quoi la page attendrait indéfiniment.
  const reseauxService = useMemo(() => {
    if (!s || !index || y == null) return null
    if (!communesService?.length || !depts.length) return []
    return fichiers ? reseauxDuService(communesService, fichiers, String(y)) : null
  }, [s, index, y, communesService, depts, fichiers])
  const nom = s ? nomService(s, id) : id
  // Mêmes titre et description que la page pré-générée du service (lib/prerendu.ts).
  usePageTitle(s ? titreService(nom) : null, s ? descriptionService(nom, s.sans_declaration) : null)

  // Constat sans issue → avec une issue (revue design du 2026-09-22, cf. NotFound.tsx). Jamais de chargement sans
  // fin : un service de l'index sans département n'a pas de fichier à attendre (vérification du 27/09).
  const avecIssue = (constat: string) => (
    <div className="page">
      <p className="muted">{constat}</p>
      <Link to="/services">Chercher une collectivité →</Link>
    </div>
  )
  if (routage.etat === 'inconnu') return avecIssue(`Aucun service d’eau ne correspond à l’identifiant ${id}.`)
  if (routage.etat === 'sans-departement') {
    const qui = renseigne(routage.nom?.replace(/^\s*eau potable\s*:?\s*/i, ''))
    return avecIssue(
      `La fiche de ce service n’est pas disponible. Le service ${qui ? `« ${qui} » (${id})` : id} figure dans l’observatoire des services d’eau (SISPEA), mais aucun département ne lui est rattaché dans les données publiées.`,
    )
  }
  if (!services || !nat || !meta) return <Chargement reserve />
  if (!s) return avecIssue(`Aucun service d’eau ne correspond à l’identifiant ${id}.`)
  const svcYear = s.annee_ind ? String(s.annee_ind) : undefined
  const natYear = anneeMediane(nat, s.annee_ind)
  const natY = natYear ? nat.annees[natYear] : undefined
  const communes = (s.communes ?? []).map((c) => ({ c, n: names.get(c) ?? c })).sort((a, b) => a.n.localeCompare(b.n, 'fr'))
  // Totaux par réseau, jamais la somme commune par commune : un prélèvement y figurerait sur chacune des communes
  // que dessert son réseau (lib/service.ts).
  const tot = reseauxService && y != null ? totauxReseaux(reseauxService, String(y)) : null
  const nRes = reseauxService?.length ?? 0
  // « . » faute de valeur dans la SISPEA (lib/sispea.ts) : ni « exploitant . » ni pastille vide.
  const exploitant = renseigne(s.op)
  const mode = modeGestion(s.mode)
  const entite = renseigne((s.nom ?? '').replace(/^\s*eau potable\s*:?\s*/i, ''))
  const prix = s.ind?.['D102.0']
  const nomDept = deptNames.get(s.dept ?? '') ?? s.dept ?? 'département'
  const liste = (
    <ul className="communes-liste">
      {communes.map((x) => (
        <li key={x.c}>
          <Link to={`/commune/${x.c}`}>{x.n}</Link>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="page">
      <Crumbs items={[echelleFrance, { label: nomDept, to: `/departement/${s.dept}` }, { label: nom }]} />
      <div className="page-head">
        <div>
          <p className="kind">Service d’eau potable</p>
          <h1>{nom}</h1>
          <p className="meta">
            {[nomDept, `${fmt.nb(communes.length, 'commune')} (composition ${s.annee_communes ?? '–'})`].join(' · ')}
          </p>
          {/* Nom interne du service dans SISPEA (« CASQ/origine-régie-P,T,D ») : en mention, jamais en sous-titre (critique UX). */}
          {renseigne(s.coll) && entite && <p className="cap">Nom du service dans SISPEA : {entite}</p>}
        </div>
      </div>

      {/* Le service tel qu'il se déclare : hors de la portée de la barre d'année, daté par sa déclaration. */}
      <section className="svc-sispea" aria-labelledby="svc-t">
        <div className="svc-id">
          <h2 className="b-q" id="svc-t">
            Le service <span className="b-y">{s.sans_declaration ? `Composition ${s.annee_communes ?? '–'}` : `SISPEA ${s.annee_ind ?? '–'}`}</span>
          </h2>
          {prix != null && (
            <p className="qui-prix">
              <span className="qui-grand">
                {fmt.dec(prix, 2)}
                {NBSP}€
              </span>{' '}
              <span className="cap">le m³ toutes taxes comprises, pour 120 m³ par an</span>
            </p>
          )}
          {(mode || exploitant) && (
            <p className="qui-ligne">
              {mode && <span className="badge neutre">{libelleMode(mode)}</span>}
              {exploitant && <span className="cap">Exploitant : {exploitant}</span>}
            </p>
          )}
          {s.pop != null && (
            <p className="cap">
              {fmt.int(s.pop)} habitants desservis, d’après la population déclarée par le service. Ce chiffre porte sur l’ensemble du service et
              ne correspond pas à la population d’un réseau.
            </p>
          )}
          {!s.sans_declaration ? (
            <p className="cap">Chiffres déclarés par la collectivité à la SISPEA, indépendants de l’année choisie plus bas.</p>
          ) : (
            (mode || exploitant) && (
              <p className="cap">
                {`${mode && exploitant ? 'Mode de gestion et exploitant' : mode ? 'Mode de gestion' : 'Exploitant'} selon la composition communale de la SISPEA (${s.annee_communes ?? '–'}), indépendamment de l’année choisie plus bas.`}
              </p>
            )
          )}
        </div>
        <div>
          {s.sans_declaration ? (
            <p className="muted">
              Aucune déclaration de ce service ne figure à la SISPEA ; aucun prix ni aucun indicateur n’est donc publié. Il figure dans la
              composition communale de {s.annee_communes ?? '–'}
              {renseigne(s.statut) ? ` (statut : « ${s.statut} »)` : ''}.
            </p>
          ) : !s.ind || Object.keys(s.ind).length === 0 ? (
            <p className="muted">Indicateurs non publiés ({s.statut ?? 'statut inconnu'}).</p>
          ) : (
            <div className="table-scroll">
              <table className="data sispea-med">
                <caption className="sr-only">Indicateurs SISPEA du service en {s.annee_ind}, face à la médiane France</caption>
                <thead>
                  <tr>
                    <th>Indicateur</th>
                    <th className="num">Ce service</th>
                    <th className="num col-med">Médiane France{natYear && natYear !== svcYear ? ` (${natYear})` : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {INDICATEURS_SERVICE.filter((r) => s.ind?.[r.code] != null).map((r) => (
                    <tr key={r.code}>
                      <td>{r.label}</td>
                      <td className="num">
                        <b>
                          {fmt.indic(s.ind![r.code], r.unit)} {r.unit}
                        </b>
                        {natY && <span className="med-dessous">médiane France : {fmt.indic(natY[r.nat].p50, r.unit)} {r.unit}</span>}
                      </td>
                      <td className="num muted col-med">{natY ? `${fmt.indic(natY[r.nat].p50, r.unit)} ${r.unit}` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <BarreAnnee
        titre="Année du bilan"
        note="Les réseaux ci-dessous et leur note suivent l’année choisie."
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setY}
      />

      <section className="bloc-service" aria-labelledby="reseaux-t">
        <div className="bloc-tete">
          <h2 id="reseaux-t">Ses réseaux {y != null ? periodeAnnee(meta, y) : ''}</h2>
          <p className="cap">Réseaux qui desservent les communes du service, avec la note de chacun.</p>
        </div>
        {/* Les notes des réseaux en une phrase (refonte du 2026-10-05), comme la page pré-générée. */}
        {reseauxService && situ && y != null && reseauxService.length > 0 && (
          <p className="svc-notes">{phraseNotesReseaux(lignesReseauxService(reseauxService, situ, String(y), names))}.</p>
        )}
        {tot && tot.plv > 0 && (
          <p className="cap agg-detail">
            {fmt.nb(tot.plv, 'prélèvement')} du contrôle sanitaire en {y} sur {nRes > 1 ? `ces ${fmt.int(nRes)} réseaux` : 'ce réseau'}
            {tot.neBact ? ` ; ${fmt.pct(100 * (1 - tot.ncBact / tot.neBact), 1)} des prélèvements analysés en bactériologie sont conformes` : ''}
            {tot.ncBact ? ` (${fmt.nb(tot.ncBact, 'non conforme', 'non conformes')})` : ''}.
          </p>
        )}
        {reseauxService && situ && y != null ? <ReseauxService reseaux={reseauxService} situ={situ} annee={String(y)} noms={names} /> : <Chargement carte />}
      </section>

      <section className="bloc-service" aria-labelledby="communes-t">
        <div className="bloc-tete">
          <h2 id="communes-t">Communes desservies</h2>
          <p className="cap">Composition du service selon la SISPEA ({s.annee_communes ?? '–'}).</p>
        </div>
        {communes.length > COMMUNES_DEPLIEES ? (
          <details className="pli">
            <summary>
              Les {fmt.int(communes.length)} {accord(communes.length, 'commune')}
            </summary>
            {liste}
          </details>
        ) : (
          liste
        )}
      </section>
      {signalementActif() && (
        <section className="card" aria-labelledby="t-signaler" id="signaler">
          <h2 id="t-signaler">Signaler une erreur sur cette page</h2>
          <Signalement />
        </section>
      )}
      <div className="source">Sources : observatoire des services d’eau (SISPEA, OFB), données déclarées par les collectivités ; contrôle sanitaire SISE-Eaux.</div>
    </div>
  )
}

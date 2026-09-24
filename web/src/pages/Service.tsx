import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import BarreAnnee from '../components/BarreAnnee'
import Chargement from '../components/Chargement'
import Crumbs from '../components/Crumbs'
import ReseauxService from '../components/ReseauxService'
import { accord, fmt } from '../lib/data'
import { useDepartements } from '../lib/geo'
import { useJson, useJsonAll } from '../lib/hooks'
import { NBSP } from '../lib/instruments'
import { compteSituations, deptsDuService, phraseAgregat, reseauxDuService, totauxReseaux } from '../lib/service'
import { modeGestion, renseigne } from '../lib/sispea'
import type { SituationsFile } from '../lib/situations'
import { usePageTitle } from '../lib/title'
import type { CommuneIndexEntry, DeptFile, MetaFile, SispeaNationalFile, SispeaServicesFile, SispeaServicesIndex } from '../lib/types'
import { anneesFiche, useYear } from '../lib/year'

const IND: { code: string; label: string; unit: string; nat: 'prix' | 'rend' | 'ilp' | 'renouv' | 'cbact' | 'cchim' | 'patrim' | 'impayes' }[] = [
  { code: 'D102.0', label: 'Prix TTC du m³ (120 m³/an)', unit: '€', nat: 'prix' },
  { code: 'P104.3', label: 'Rendement du réseau', unit: '%', nat: 'rend' },
  { code: 'P106.3', label: 'Pertes en réseau', unit: 'm³/km/j', nat: 'ilp' },
  { code: 'P107.2', label: 'Renouvellement annuel', unit: '%', nat: 'renouv' },
  { code: 'P101.1', label: 'Conformité microbiologique déclarée', unit: '%', nat: 'cbact' },
  { code: 'P102.1', label: 'Conformité physico-chimique déclarée', unit: '%', nat: 'cchim' },
  { code: 'P103.2B', label: 'Connaissance du patrimoine', unit: '/120', nat: 'patrim' },
  { code: 'P154.0', label: 'Taux d’impayés', unit: '%', nat: 'impayes' },
]
/** Au-delà, la liste des communes se replie (maquette du 23/09). */
const COMMUNES_DEPLIEES = 24
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Fiche service d'eau (maquette « vigilance + instruments » du 23/09). D'abord le service tel qu'il se déclare à la
 * SISPEA, daté, face à la médiane France et sans « mieux / moins bien » ; puis la barre d'année et, sous elle, ses
 * réseaux de l'année — un agrégat en une phrase grise, puis chaque réseau avec son voyant — ; enfin ses communes.
 * Le contrôle sanitaire se lit par réseau, la SISPEA rattache des communes (lib/service.ts).
 */
export default function Service() {
  const { id = '' } = useParams()
  const svcIndex = useJson<SispeaServicesIndex>('sispea/services-index.json').data
  const deptOfService = svcIndex?.[id]?.[1] ?? null
  const services = useJson<SispeaServicesFile>(deptOfService ? `sispea/services/${deptOfService}.json` : null).data
  const { names: deptNames } = useDepartements()
  const nat = useJson<SispeaNationalFile>('sispea/national.json').data
  const meta = useJson<MetaFile>('meta.json').data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
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
  // Même compte pour la phrase d'agrégat et pour les lignes des réseaux, qui ne peuvent donc pas se contredire.
  const situAgg = useMemo(() => {
    if (!situ || !reseauxService?.length) return null
    const c = compteSituations(reseauxService.map((r) => situ.reseaux[r.code]))
    return c.n > 0 ? c : null
  }, [situ, reseauxService])
  const nom = renseigne(s?.coll) ?? renseigne(s?.nom) ?? id
  usePageTitle(s ? `${nom} · service d’eau` : null, s ? `Service d'eau potable ${nom} : prix, indicateurs SISPEA, réseaux et communes desservies.` : null)

  // Constat sans issue → avec une issue (revue design du 2026-09-22, cf. NotFound.tsx).
  if (svcIndex && !svcIndex[id])
    return (
      <div className="page">
        <p className="muted">Service inconnu ({id}).</p>
        <Link to="/services">Chercher une collectivité →</Link>
      </div>
    )
  if (!services || !nat || !meta) return <Chargement />
  if (!s)
    return (
      <div className="page">
        <p className="muted">Service inconnu ({id}).</p>
        <Link to="/services">Chercher une collectivité →</Link>
      </div>
    )
  // Même garde que la page Services : ne comparer qu'à un millésime national assez déclaré (>=3000 services
  // avec un prix), sinon au dernier qui l'est, plutôt qu'à la poignée de déclarants précoces d'une année neuve.
  const natYears = Object.keys(nat.annees).filter((a) => (nat.annees[a].prix.n ?? 0) >= 3000).sort()
  const svcYear = s.annee_ind ? String(s.annee_ind) : undefined
  const natYear = svcYear && natYears.includes(svcYear) ? svcYear : natYears[natYears.length - 1]
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
      <Crumbs items={[{ label: nomDept, to: `/departement/${s.dept}` }, { label: nom }]} />
      <div className="page-head">
        <div>
          <p className="kind">Service d’eau potable</p>
          <h1>{nom}</h1>
          <p className="meta">
            {[renseigne(s.coll) ? entite : null, nomDept, `${fmt.nb(communes.length, 'commune')} (composition ${s.annee_communes ?? '–'})`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* Le service tel qu'il se déclare : hors de la portée de la barre d'année, daté par sa déclaration. */}
      <section className="svc-sispea" aria-labelledby="svc-t">
        <div className="svc-id">
          <h2 className="b-q" id="svc-t">
            Le service <span className="b-y">SISPEA {s.annee_ind ?? '–'}</span>
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
              {mode && <span className="badge neutre">{majuscule(mode)}</span>}
              {exploitant && <span className="cap">Exploitant : {exploitant}</span>}
            </p>
          )}
          {s.pop != null && <p className="cap">{fmt.int(s.pop)} habitants desservis selon le service (population qu’il déclare, pas celle d’un réseau).</p>}
          <p className="cap">Chiffres déclarés par la collectivité à la SISPEA : ils ne suivent pas l’année choisie plus bas.</p>
        </div>
        <div>
          {!s.ind || Object.keys(s.ind).length === 0 ? (
            <p className="muted">Indicateurs non publiés ({s.statut ?? 'statut inconnu'}).</p>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <caption className="sr-only">Indicateurs SISPEA du service en {s.annee_ind}, face à la médiane France</caption>
                <thead>
                  <tr>
                    <th>Indicateur</th>
                    <th className="num">Ce service</th>
                    <th className="num">Médiane France{natYear && natYear !== svcYear ? ` (${natYear})` : ''}</th>
                  </tr>
                </thead>
                <tbody>
                  {IND.filter((r) => s.ind?.[r.code] != null).map((r) => (
                    <tr key={r.code}>
                      <td>{r.label}</td>
                      <td className="num">
                        <b>
                          {fmt.dec(s.ind![r.code], 2)} {r.unit}
                        </b>
                      </td>
                      <td className="num muted">{natY ? `${fmt.dec(natY[r.nat].p50, 2)} ${r.unit}` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <BarreAnnee
        titre="Qualité de l’eau : bilan de l’année"
        note="Les réseaux ci-dessous et leur situation suivent l’année choisie."
        annees={anneesFiche(meta)}
        annee={y}
        onChange={setY}
      />

      <section className="bloc-service" aria-labelledby="reseaux-t">
        <div className="bloc-tete">
          <h2 id="reseaux-t">Ses réseaux en {y}</h2>
          <p className="cap">Réseaux qui desservent les communes du service, chacun jugé selon le bilan officiel de chaque famille.</p>
        </div>
        {/* L'agrégat en une phrase grise : la couleur de jugement reste aux réseaux, un par un. */}
        {situAgg && <p className="agg">{phraseAgregat(situAgg)}.</p>}
        {tot && tot.plv > 0 && (
          <p className="cap agg-detail">
            {fmt.nb(tot.plv, 'prélèvement')} du contrôle sanitaire en {y} sur {nRes > 1 ? `ces ${fmt.int(nRes)} réseaux` : 'ce réseau'}
            {tot.neBact ? `, ${fmt.pct(100 * (1 - tot.ncBact / tot.neBact), 1)} de conformes en bactériologie` : ''}
            {tot.ncBact ? ` (${fmt.nb(tot.ncBact, 'non conforme', 'non conformes')})` : ''}.
          </p>
        )}
        {reseauxService && situ && y != null ? <ReseauxService reseaux={reseauxService} situ={situ} annee={String(y)} /> : <Chargement carte />}
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
      <div className="source">Sources : observatoire des services d’eau (SISPEA, OFB), données déclarées par les collectivités ; contrôle sanitaire SISE-Eaux.</div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import BarreAnnee from './BarreAnnee'
import CarteCommunesServices from './CarteCommunesServices'
import FranceMap from './FranceMap'
import MapLegend from './MapLegend'
import { useJson } from '../lib/hooks'
import { type IndicDept } from '../lib/indicateursDept'
import { anneesSispea } from '../lib/sispea'
import { useCleTheme } from '../lib/theme'
import type { AmontFile, RessourceFile, SispeaNationalFile } from '../lib/types'
import { lienDepartement } from '../lib/parcours'
import { lignesCarte, type LigneCarte } from '../lib/tableauDepts'
import TableauDeptsTri, { type Colonne } from './TableauDeptsTri'

/**
 * Carte d'un indicateur départemental des pages « Comprendre » sur /carte (services d'eau, ressource, amont) :
 * l'année d'abord (règle de l'auteur, 23/09) — barre des millésimes SISPEA, ou période datée pour une source qui
 * n'en publie qu'une —, puis la carte, sa légende et le tableau des départements. Un indicateur des services d'eau, qui a une vue
 * communale (`ind.commune`), se lit comme ceux de l'eau du robinet : un clic sur un département affiche ses communes,
 * « Toutes les communes » la France entière (`dept`, `fondCommunes` : l'URL de /carte). Pour les autres, un clic
 * ouvre la fiche du département : leurs sources ne descendent pas à la commune.
 */
export default function CarteDept({
  ind,
  deps,
  deptName,
  dept,
  fondCommunes,
}: {
  ind: IndicDept
  deps: FeatureCollection | null
  deptName: Map<string, string>
  dept: string | null
  fondCommunes: boolean
}) {
  const cle = useCleTheme()
  const [sp, setSp] = useSearchParams()
  const [survol, setSurvol] = useState<string | null>(null)
  // « Voir ses communes » (encart) reste sur /carte (vue communale) : sans cela, le département survolé avant le clic
  // resterait mis en évidence au retour à la France entière, comme Carte.tsx le fait pour l'eau du robinet.
  useEffect(() => {
    setSurvol(null)
  }, [ind, dept, fondCommunes])
  const sispea = useJson<SispeaNationalFile>(ind.source === 'sispea' ? 'sispea/national.json' : null).data
  const ressource = useJson<RessourceFile>(ind.source === 'ressource' ? 'ressource/national.json' : null).data
  const amont = useJson<AmontFile>(ind.source === 'amont' ? 'amont/national.json' : null).data
  const donnees = useMemo(() => ({ sispea, ressource, amont }), [sispea, ressource, amont])
  const charge = ind.source === 'sispea' ? sispea : ind.source === 'ressource' ? ressource : amont

  // Millésime SISPEA dans l'URL (?sispea=), la clé de la page /services ; le plus récent assez déclaré par défaut.
  const annees = useMemo(() => anneesSispea(sispea), [sispea])
  const anneeUrl = sp.get('sispea')
  const annee = ind.source === 'sispea' ? (anneeUrl && annees.includes(anneeUrl) ? anneeUrl : annees[annees.length - 1]) : undefined
  const setAnnee = (a: number) => {
    const next = new URLSearchParams(sp)
    next.set('sispea', String(a))
    setSp(next)
  }

  const valeurs = useMemo(() => ind.valeurs(donnees, annee), [ind, donnees, annee])
  // Une seule source pour les couleurs et la légende ; relue au changement de thème.
  const echelle = useMemo(() => ind.echelle(), [ind, cle])
  const periode = charge ? ind.periode(donnees, annee) : ''
  const colorOf = useCallback((p: Record<string, unknown>) => echelle.color(valeurs.get(String(p.code)) ?? null), [echelle, valeurs])
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const v = valeurs.get(String(p.code))
      return `<b>${p.nom}</b> (${p.code})<br>${v == null ? 'pas de donnée' : ind.ecrire(v)}`
    },
    [valeurs, ind],
  )
  // Tableau des départements (refonte, lot 4) : alphabétique, tri au choix du visiteur ; un indicateur de contexte (prix,
  // ressource, amont) n'a pas d'effectif publié ici, toutes ses valeurs entrent dans un tri.
  const lignes = useMemo(() => lignesCarte(valeurs.keys(), (d) => valeurs.get(d) ?? null, () => null, (d) => deptName.get(d) ?? d), [valeurs, deptName])
  const colonnes = useMemo<Colonne<LigneCarte>[]>(
    () => [{ cle: 'v', titre: ind.unit, quoi: `la valeur de l’indicateur (${ind.label.toLowerCase()})`, num: true, valeur: (l) => l.v, cellule: (l) => (l.v == null ? '–' : ind.ecrire(l.v)) }],
    [ind],
  )

  const vueCommunes = !!ind.commune && (dept != null || fondCommunes)
  // Année de la vue communale : celle de la barre pour les services d'eau ; pour la protection des captages, la
  // consommation et les fuites, l'année SISPEA de la page Ressource, celle de leur carte départementale.
  const anneeCommunes = ind.source === 'sispea' ? annee : ressource ? String(ressource.national.annee_sispea) : undefined
  // Sélection d'un département dans l'URL de /carte : un lien du tableau, accessible au clavier.
  const versCommunes = (dd: string) => {
    const next = new URLSearchParams(sp)
    next.set('dept', dd)
    return next
  }

  return (
    <>
      {ind.source === 'sispea' ? (
        <BarreAnnee
          titre="Année des données SISPEA"
          note={`Elle vaut pour la carte${vueCommunes ? (dept ? ' et la liste des services' : '') : ' et le tableau des départements'}. Seules sont proposées les années pour lesquelles suffisamment de services ont déclaré leurs données.`}
          annees={annees.map((a) => ({ annee: Number(a), enCours: false, sansDonnees: false }))}
          annee={annee ? Number(annee) : undefined}
          onChange={setAnnee}
          param="sispea"
        />
      ) : (
        <div className="barre-annee">
          <div>
            <p className="ba-titre">Période des données</p>
            <p className="ba-note">La source ne publie qu'une période à la fois. La carte présente la plus récente, sans choix d'année.</p>
          </div>
          <p className="ba-periode">{periode || '…'}</p>
        </div>
      )}
      {vueCommunes ? (
        <CarteCommunesServices ind={ind} annee={anneeCommunes} dept={dept} />
      ) : (
      <div className="grid cols-map">
        <div>
          <FranceMap
            data={deps}
            colorOf={colorOf}
            labelOf={labelOf}
            encart={(dd) => ({ fiche: lienDepartement(dd, { section: ind.section }), communes: ind.commune ? () => setSp(versCommunes(dd)) : undefined })}
            onHover={(p) => setSurvol(p ? String(p.code) : null)}
            selected={survol}
            height={620}
            message={charge ? null : 'Chargement des données…'}
            ariaLabel={`${ind.label}, par département ; le tableau à côté reprend les valeurs`}
          />
          <MapLegend desc={`${ind.label} (${ind.unit}${periode ? `, ${periode}` : ''})${ind.note ? `, ${ind.note}` : ''}`} scale={echelle} format={ind.borne} />
        </div>
        <div className="card">
          <h3>Les départements</h3>
          <p className="muted">
            Par ordre alphabétique ; un tri est proposé.{' '}
            {ind.commune
              ? 'Un clic sur un département de la carte ouvre sa fiche, qui porte la carte de ses communes ; un lien du tableau affiche ses communes.'
              : 'Un clic sur un département ouvre sa fiche.'}
          </p>
          {lignes.length > 0 && (
            <TableauDeptsTri
              lignes={lignes}
              colonnes={colonnes}
              lien={(dd) => (ind.commune ? `?${versCommunes(dd)}` : lienDepartement(dd, { section: ind.section }))}
              legende={`Les départements, par ordre alphabétique ou selon le tri choisi : ${ind.label}${periode ? `, ${periode}` : ''} ; version textuelle de la carte`}
              selection={survol}
              onSurvol={setSurvol}
              csv={{
                sujet: `carte-${ind.key}`,
                annee: annee ?? periode.replace(/[^0-9a-zA-Z-]+/g, '-'),
                entetes: ['Code du département', 'Département', 'Période', `${ind.label} (${ind.unit})`],
                ligne: (l) => [l.dd, l.nom, annee ?? periode, l.v],
                note: `${ind.label} ; séparateur point-virgule.`,
              }}
            />
          )}
        </div>
      </div>
      )}
    </>
  )
}

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import { classesScale, DESC_CARTE_COMMUNES, etatLettreCommune, legendeClasses, lettresCommunes, rangLettre, type LettreCommune } from '../lib/france'
import { useJson } from '../lib/hooks'
import type { SituationsFile } from '../lib/situations'
import { communeDeRattachement, type CommuneIndexEntry, type DeptFile } from '../lib/types'
import FranceMap from './FranceMap'
import MapLegend from './MapLegend'

/**
 * Lettre de chaque commune d'un département (lib/france.ts, lettresCommunes) : réseaux de chaque commune dans
 * dept/<dd>.json, classes dans situations/<année>.json ; aucune donnée nouvelle du pipeline. Couleur et info-bulle d'une
 * entité de la carte ; un arrondissement de Paris, Marseille ou Lyon prend la lettre de sa commune.
 */
export function useLettresCommunes(dept: string | null, annee: number | string | null | undefined, situ: SituationsFile | null | undefined) {
  const fichier = useJson<DeptFile>(dept ? `dept/${dept}.json` : null).data
  const lettres = useMemo(() => lettresCommunes(fichier, situ, annee), [fichier, situ, annee])
  const pret = !!fichier && !!situ
  const lettreDe = useCallback((code: string): LettreCommune | undefined => lettres.get(communeDeRattachement(code)), [lettres])
  const couleur = useCallback((p: Record<string, unknown>) => classesScale.color(rangLettre(lettreDe(String(p.code))?.lettre)), [lettreDe])
  return { lettres, lettreDe, couleur, pret }
}

/** Info-bulle d'une commune de la carte des classes : son nom (et celui de la commune d'un arrondissement), sa lettre. */
export function infoBulleLettre(p: Record<string, unknown>, noms: ReadonlyMap<string, string>, c: LettreCommune | undefined, annee: string | number): string {
  const code = String(p.code)
  const rattache = communeDeRattachement(code)
  const nomPropre = (p.nom as string | undefined) ?? noms.get(code) ?? code
  const titre = rattache !== code ? `<b>${nomPropre}</b> · ensemble de ${noms.get(rattache) ?? rattache}` : `<b>${nomPropre}</b>`
  return `${titre}<br>${etatLettreCommune(c, annee)}`
}

/**
 * Carte communale des classes d'un département (tête de la fiche département, refonte, lot 3) : chaque commune prend la
 * lettre la plus défavorable des réseaux qui la desservent, aux couleurs des tuiles (palette de la carte, A en bleu
 * clair) ; hachures sans réseau classé. Légende A–D aux libellés de l'indicateur, marqués. Un clic ouvre la fiche
 * de la commune.
 */
export default function CarteClassesCommunes({
  dept,
  nomDept,
  annee,
  situ,
  selection,
  onSurvol,
  height = 520,
}: {
  dept: string
  nomDept: string
  annee: number | undefined
  situ: SituationsFile | null | undefined
  selection?: string | null
  onSurvol?: (insee: string | null) => void
  height?: number | string
}) {
  const nav = useNavigate()
  const communes = useJson<FeatureCollection>(`geo/communes/${dept}.json`).data
  const index = useJson<CommuneIndexEntry[]>('communes.json').data
  const noms = useMemo(() => new Map((index ?? []).map((e) => [e.c, e.n])), [index])
  const { lettreDe, couleur, pret } = useLettresCommunes(dept, annee, situ)
  const label = useCallback((p: Record<string, unknown>) => infoBulleLettre(p, noms, lettreDe(String(p.code)), annee ?? ''), [noms, lettreDe, annee])
  return (
    <div>
      <FranceMap
        data={pret ? communes : null}
        colorOf={couleur}
        labelOf={label}
        onClick={(p) => nav(`/commune/${communeDeRattachement(String(p.code))}`, { viewTransition: true })}
        onHover={onSurvol && ((p) => onSurvol(p ? communeDeRattachement(String(p.code)) : null))}
        selected={selection}
        height={height}
        ariaLabel={`Carte des communes du département ${nomDept} : ${DESC_CARTE_COMMUNES}, en ${annee}. La liste des réseaux notés C ou D, placée à côté, en donne une version textuelle.`}
      />
      <MapLegend desc={DESC_CARTE_COMMUNES} scale={classesScale} format={String} cases={legendeClasses()} noDataLabel="aucun réseau classé" />
    </div>
  )
}

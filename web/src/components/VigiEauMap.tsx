import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FranceMap from './FranceMap'
import { useDepartements } from '../lib/geo'
import { couleursEtats, noData } from '../lib/theme'
import { TONS_SECHERESSE } from '../lib/vigieau'

/** Réponse de https://api.vigieau.gouv.fr/api/departements (extrait). */
export interface VigiDept {
  code: string
  nom: string
  niveauGraviteMax: string | null
  niveauGraviteSupMax: string | null
  niveauGraviteSouMax: string | null
  niveauGraviteAepMax: string | null
}
export type Ressource = 'max' | 'sup' | 'sou' | 'aep'
export const RESSOURCES: { key: Ressource; label: string; field: keyof VigiDept }[] = [
  { key: 'max', label: 'Niveau maximal', field: 'niveauGraviteMax' },
  { key: 'sup', label: 'Eaux superficielles', field: 'niveauGraviteSupMax' },
  { key: 'sou', label: 'Eaux souterraines', field: 'niveauGraviteSouMax' },
  { key: 'aep', label: 'Eau potable', field: 'niveauGraviteAepMax' },
]
export const NIVEAUX: { key: string; label: string; ordre: number }[] = [
  { key: 'pas_de_restriction', label: 'Pas de restriction', ordre: 0 },
  { key: 'vigilance', label: 'Vigilance', ordre: 1 },
  { key: 'alerte', label: 'Alerte', ordre: 2 },
  { key: 'alerte_renforcee', label: 'Alerte renforcée', ordre: 3 },
  { key: 'crise', label: 'Crise', ordre: 4 },
]
/**
 * Couleur d'un niveau de sécheresse dans le thème courant, la même sur la carte, sa légende, les listes et les
 * graphiques : la palette de « Lire un bulletin » (lib/vigieau.ts, TONS_SECHERESSE) ; de deux degrés d'une même
 * couleur, le plus grave ressort davantage (orange clair puis orange, rouge puis rouge fort).
 */
export function couleurNiveau(key: string): string {
  const n = NIVEAUX.find((x) => x.key === key)
  return n ? couleursEtats(TONS_SECHERESSE)[n.ordre] : noData()
}

// Mémorisé au niveau module : la carte et la page Sécheresse appellent chacune useVigiEau() sur le même
// rendu, sans ce cache elles interrogeraient l'API deux fois et pourraient afficher des états différents
// le temps que les deux requêtes répondent. Un échec n'est pas gardé en cache, pour être retenté au montage suivant.
let vigiEauPromise: Promise<VigiDept[]> | null = null
function fetchVigiEau(): Promise<VigiDept[]> {
  if (!vigiEauPromise) {
    const p = fetch('https://api.vigieau.gouv.fr/api/departements').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    p.catch(() => {
      vigiEauPromise = null
    })
    vigiEauPromise = p
  }
  return vigiEauPromise
}

export function useVigiEau(): { depts: VigiDept[] | null; error: string | null } {
  const [depts, setDepts] = useState<VigiDept[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetchVigiEau().then((d) => alive && setDepts(d), (e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])
  return { depts, error }
}

/** Carte de France des restrictions sécheresse du jour, par département, interrogée en direct chez VigiEau. */
type Props = {
  ressource?: Ressource
  height?: number
  onHover?: (props: Record<string, unknown> | null) => void
  selected?: string | null
}
/*
 * Revue du 2026-09-22 : pendant l'appel à l'API, la carte peignait tous les départements « sans donnée »
 * (voile « Chargement » désormais) ; en cas d'échec, carte et légende disparaissaient au profit d'une
 * ligne de texte (les contours restent, avec un message) ; un clic ouvre la fiche du département,
 * comme sur les autres cartes.
 */

export default function VigiEauMap({ ressource = 'max', height = 560, onHover, selected }: Props) {
  const { deps } = useDepartements()
  const { depts, error } = useVigiEau()
  const nav = useNavigate()
  const field = RESSOURCES.find((r) => r.key === ressource)!.field
  const byCode = useMemo(() => new Map((depts ?? []).map((d) => [d.code, d])), [depts])
  const colorOf = useCallback(
    (p: Record<string, unknown>) => {
      // Département absent de la réponse : « sans donnée », pas « pas de restriction ».
      const d = byCode.get(String(p.code))
      if (!d) return noData()
      return couleurNiveau((d[field] as string | null) ?? 'pas_de_restriction')
    },
    [byCode, field],
  )
  const labelOf = useCallback(
    (p: Record<string, unknown>) => {
      const d = byCode.get(String(p.code))
      if (!d) return `<b>${p.nom}</b> (${p.code})<br>pas de donnée`
      const lvl = (d[field] as string | null) ?? 'pas_de_restriction'
      return `<b>${p.nom}</b> (${p.code})<br>${NIVEAUX.find((n) => n.key === lvl)?.label ?? 'inconnu'}`
    },
    [byCode, field],
  )
  return (
    <>
      <FranceMap
        data={depts || error ? deps : null}
        colorOf={colorOf}
        labelOf={labelOf}
        onClick={(p) => nav(`/departement/${p.code}`)}
        actionLabel="Ouvrir la fiche du département →"
        onHover={onHover}
        selected={selected}
        height={height}
        message={error ? `VigiEau injoignable (${error}) : réessayer dans quelques minutes.` : null}
        ariaLabel={`Niveaux de restriction sécheresse par département (${RESSOURCES.find((r) => r.key === ressource)!.label.toLowerCase()})`}
      />
      <div className="legend">
        <span className="legend-desc">niveau de restriction en vigueur :</span>
        <span className="legend-scale">
          {NIVEAUX.map((n) => (
            <span key={n.key} className="legend-item">
              <span className="swatch" style={{ background: couleurNiveau(n.key) }} aria-hidden="true" /> {n.label}
            </span>
          ))}
          <span className="legend-item">
            <span className="swatch" style={{ background: noData() }} aria-hidden="true" /> sans donnée
          </span>
        </span>
      </div>
    </>
  )
}

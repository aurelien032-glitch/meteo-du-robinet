import { useMemo } from 'react'
import type { FeatureCollection } from 'geojson'
import { useJson } from './hooks'

/**
 * Contours des départements et table code → nom, partagés par les pages carte, thème, amont, département. Les noms
 * viennent d'abord du petit index de la recherche (recherche/departements.json, 2 ko), qui arrive bien avant les
 * contours (2 Mo) : sans lui, les titres affichaient « 35 · communes » le temps du chargement (vérification du 24/09).
 */
export function useDepartements(): { deps: FeatureCollection | null; names: Map<string, string> } {
  const deps = useJson<FeatureCollection>('geo/departements.json').data
  const legers = useJson<Record<string, string>>('recherche/departements.json').data
  const names = useMemo(() => {
    const m = new Map<string, string>(Object.entries(legers ?? {}))
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps, legers])
  return { deps, names }
}

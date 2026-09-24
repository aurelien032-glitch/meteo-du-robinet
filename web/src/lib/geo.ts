import { useMemo } from 'react'
import type { FeatureCollection } from 'geojson'
import { useJson } from './hooks'

/** Contours des départements et table code → nom, partagés par les pages carte, thème, amont, département. */
export function useDepartements(): { deps: FeatureCollection | null; names: Map<string, string> } {
  const deps = useJson<FeatureCollection>('geo/departements.json').data
  const names = useMemo(() => {
    const m = new Map<string, string>()
    deps?.features.forEach((f) => m.set(String(f.properties?.code), String(f.properties?.nom)))
    return m
  }, [deps])
  return { deps, names }
}

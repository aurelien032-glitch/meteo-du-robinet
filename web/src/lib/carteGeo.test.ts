import { describe, expect, it } from 'vitest'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { aire, bbox, plusGrandesParties } from './carteGeo'

const carre = (x: number, y: number, c: number) => [
  [x, y],
  [x + c, y],
  [x + c, y + c],
  [x, y + c],
  [x, y],
]
const entite = (geometry: Geometry | null, properties: Record<string, unknown> = {}): Feature<Geometry | null> => ({ type: 'Feature', properties, geometry })

describe('bbox', () => {
  it('emprise de polygones, multipolygones et points mêlés', () => {
    const f = [
      entite({ type: 'Polygon', coordinates: [carre(2, 46, 1)] }),
      entite({ type: 'MultiPolygon', coordinates: [[carre(-1.5, 43, 0.5)], [carre(7, 48.5, 0.5)]] }),
      entite({ type: 'Point', coordinates: [9.4, 42.1] }),
    ]
    expect(bbox(f)).toEqual([
      [-1.5, 42.1],
      [9.4, 49],
    ])
  })
  it('null sans géométrie', () => {
    expect(bbox([])).toBeNull()
    expect(bbox([entite(null)])).toBeNull()
  })
})

describe('plusGrandesParties', () => {
  it('une entité par libellé : la plus grande partie d’un multipolygone, avec son aire pour priorité', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        entite({ type: 'MultiPolygon', coordinates: [[carre(0, 0, 1)], [carre(5, 5, 3)], [carre(10, 10, 2)]] }, { code: '29', nom: 'Finistère' }),
        entite({ type: 'Polygon', coordinates: [carre(0, 0, 2)] }, { code: '35' }),
        entite(null, { code: '00' }),
        entite({ type: 'Point', coordinates: [1, 1] }, { code: '01' }),
      ] as Feature[],
    }
    const r = plusGrandesParties(fc)
    expect(r.features.map((f) => f.properties)).toEqual([
      { code: '29', nom: 'Finistère', __aire: 9 },
      { code: '35', __aire: 4 },
    ])
    expect(r.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [carre(5, 5, 3)] })
  })
  it('aire d’un anneau, quel que soit son sens', () => {
    expect(aire(carre(0, 0, 2))).toBe(4)
    expect(aire([...carre(0, 0, 2)].reverse())).toBe(4)
  })
})

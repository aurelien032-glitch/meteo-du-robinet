import type * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { cssVar } from './theme'

/**
 * Fonctions de la carte choroplèthe (components/FranceMap.tsx) qui ne tiennent pas à son instance MapLibre : police et
 * textes des commandes, recherche de l'entité sous le pointeur, motif des hachures, géométrie des libellés et du cadrage.
 */

/** Emprise : [[ouest, sud], [est, nord]]. */
export type Bounds = [[number, number], [number, number]]

/**
 * Police des libellés. Le style ne déclare pas de fichiers de glyphes : MapLibre dessine alors le texte
 * lui-même avec une police de la page (TinySDF). Il déduit la graisse du NOM de la police, d'où cet
 * alias d'Atkinson Hyperlegible Next (servie avec le site) déclaré en semi-gras : le fichier est variable,
 * le navigateur en tire la graisse 600.
 */
export const POLICE = 'Robinet Carte SemiBold'
/** Atkinson Hyperlegible Next, la police de texte de la plateforme (charte « Vigilance + instruments »). */
const POLICE_FICHIER = '/fonts/atkinson/next.woff2'
let policePrete: Promise<void> | null = null
export function chargerPolice(): Promise<void> {
  policePrete ??= (async () => {
    try {
      const f = new FontFace(POLICE, `url(${POLICE_FICHIER}) format('woff2')`, { weight: '200 800' })
      document.fonts.add(await f.load())
    } catch {
      /* police indisponible : MapLibre retombe sur la police sans empattement du système */
    }
  })()
  return policePrete
}

/** Textes des commandes de MapLibre, en français. */
export const LOCALE = {
  'Map.Title': 'Carte',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'AttributionControl.ToggleAttribution': 'Afficher ou masquer les sources',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte',
}

/**
 * Entité sous un point, sinon la plus proche à quelques pixels près (choix de l'auteur, 27/09 : clic tolérant). À
 * l'échelle de la France, une commune ne couvre qu'un ou deux pixels et la simplification des contours lui retire sa
 * surface : le clic ne trouvait que des limites et ne faisait rien. Les limites portent les mêmes propriétés que les
 * surfaces ; la première entité du plus petit carré qui en touche une est retenue.
 */
export function entiteSous(map: maplibregl.Map, p: maplibregl.Point): maplibregl.MapGeoJSONFeature | undefined {
  const exacte = map.queryRenderedFeatures(p, { layers: ['zones-fill'] })[0]
  if (exacte) return exacte
  for (const r of [3, 6, 10]) {
    const autour = map.queryRenderedFeatures(
      [
        [p.x - r, p.y - r],
        [p.x + r, p.y + r],
      ],
      { layers: ['zones-fill', 'zones-line'] },
    )[0]
    if (autour) return autour
  }
  return undefined
}

/**
 * Motif « sans donnée » et « pas d'information » (choix de l'auteur, 27/09 : hachures partout) : celui de la carte de
 * l'accueil et des légendes, trait --border-fort sur fond --bg, répété dans les entités sans valeur. L'aplat
 * --surface-2 ne se distinguait pas du fond (contraste 1,09:1) : l'Isère, sans information, paraissait vide.
 * 12 pixels à la densité 2, soit un pas de 6 px à l'écran comme sur l'accueil ; relu à chaque changement de thème.
 */
export function motifHachures(): ImageData | null {
  const n = 12
  const toile = document.createElement('canvas')
  toile.width = toile.height = n
  const g = toile.getContext('2d')
  if (!g) return null
  g.fillStyle = cssVar('--bg')
  g.fillRect(0, 0, n, n)
  g.strokeStyle = cssVar('--border-fort')
  g.lineWidth = 2.5
  g.beginPath()
  for (const d of [-n, 0, n]) {
    g.moveTo(d, n)
    g.lineTo(d + n, 0)
  }
  g.stroke()
  return g.getImageData(0, 0, n, n)
}

/** Aire (en degrés², pour comparer) d'un anneau. */
export function aire(anneau: Position[]): number {
  let a = 0
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) a += (anneau[j][0] + anneau[i][0]) * (anneau[j][1] - anneau[i][1])
  return Math.abs(a / 2)
}

/** Chaque entité réduite à sa plus grande partie, pour n'y poser qu'un libellé. */
export function plusGrandesParties(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.flatMap((f) => {
      const g = f.geometry
      if (!g) return []
      // __aire : priorité de placement (les plus grandes entités d'abord quand les libellés se gênent).
      if (g.type === 'Polygon') return [{ type: 'Feature' as const, properties: { ...f.properties, __aire: aire(g.coordinates[0]) }, geometry: g }]
      if (g.type !== 'MultiPolygon' || !g.coordinates.length) return []
      const grande = g.coordinates.reduce((m, p) => (aire(p[0]) > aire(m[0]) ? p : m))
      return [{ type: 'Feature' as const, properties: { ...f.properties, __aire: aire(grande[0]) }, geometry: { type: 'Polygon' as const, coordinates: grande } }]
    }),
  }
}

/** Emprise des entités (longitudes, latitudes) ; null sans géométrie. */
export function bbox(features: Feature<Geometry | null>[]): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (c: Position | Position[] | Position[][] | Position[][][]) => {
    if (typeof c[0] === 'number') {
      const [x, y] = c as Position
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else (c as Position[]).forEach((cc) => visit(cc as Position))
  }
  for (const f of features) {
    const g = f.geometry
    if (g && 'coordinates' in g) visit(g.coordinates as Position[])
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null
}

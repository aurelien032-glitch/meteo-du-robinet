import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import urlTravailleur from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useNavigate } from 'react-router-dom'
import type { FeatureCollection } from 'geojson'
import EncartCarte, { type LiensEncart } from './EncartCarte'
import { bbox, chargerPolice, entiteSous, LOCALE, motifHachures, plusGrandesParties, POLICE, type Bounds } from '../lib/carteGeo'
import { useReglageCarte } from '../lib/hooks'
import { liensAvecCommunes } from '../lib/parcours'
import { cssVar, noData } from '../lib/theme'

export type { Bounds }

// MapLibre 6 ne publie plus qu'un module ES (2026-10-07, montée de version pour la faille de DOM.sanitize) : sous Vite,
// il ne retrouve pas seul le fichier de son worker, que `?worker&url` empaquette et dont l'adresse lui est donnée ici.
maplibregl.setWorkerUrl(urlTravailleur)

/**
 * Évènement « carte prête » propre au site, tiré à la fin du chargement de la carte. MapLibre 6 type ses évènements et
 * ne connaît pas celui-ci : il passe par la conversion que la documentation de MapLibre prévoit pour un évènement personnalisé.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PRETE = 'robinet:ready' as any

export type Props = {
  /** Contours à colorier ; `null` pendant le chargement (la carte affiche alors un voile et ignore les clics). */
  data: FeatureCollection | null
  /** Couleur de remplissage d'une entité (null → gris « sans donnée »). */
  colorOf: (props: Record<string, unknown>) => string
  /** Texte de l'info-bulle (au survol, et au toucher). */
  labelOf?: (props: Record<string, unknown>) => string
  onClick?: (props: Record<string, unknown>) => void
  /** Entité survolée (null en sortant), pour lier la carte au tableau voisin. */
  onHover?: (props: Record<string, unknown> | null) => void
  height?: number | string
  /** Contour de sélection (code de l'entité mise en avant). */
  selected?: string | null
  idKey?: string
  /** Description textuelle pour les lecteurs d'écran. */
  ariaLabel?: string
  /** Emprise imposée (encarts, carte de situation) ; sinon l'emprise des données, ou la métropole si elles couvrent l'outre-mer. */
  bounds?: Bounds
  /** Encart : pas de commandes, pas de libellés, pas de zoom, pas d'encarts imbriqués. */
  inset?: boolean
  /** Encarts d'outre-mer quand les données les contiennent (défaut : oui, sauf jeux très lourds). */
  drom?: boolean
  /**
   * Libellés posés sur la carte (décisions de l'auteur, 2026-09-22) : des NOMS, jamais des numéros —
   * départements dès la vue France, communes à l'échelle départementale, les chevauchements étant
   * écartés par MapLibre. Défaut : selon le nombre d'entités.
   */
  etiquettes?: 'departements' | 'communes' | false
  /** Message posé sur la carte (erreur de chargement, millésime sans donnée…). */
  message?: string | null
  /** Libellé du lien de l'info-bulle au toucher, quand un clic ouvre une fiche. */
  actionLabel?: string
  /**
   * Liens d'un département de la carte (lib/parcours.ts). Un clic, à la souris comme au toucher, ouvre directement sa
   * fiche (`fiche`, choix de l'auteur du 2026-10-05 ; l'encart du 25/09 n'est plus montré que sans fiche).
   */
  encart?: (code: string) => LiensEncart
  /** Encart de territoire d'une carte à encart : son clic sélectionne dans la carte parente, sans info-bulle à bouton. */
  clicDirect?: boolean
}

export const METROPOLE: Bounds = [
  [-5.4, 41.3],
  [9.8, 51.2],
]
/** Départements et régions d'outre-mer, pour les encarts et les boutons de cadrage. */
export const TERRITOIRES: { code: string; label: string; bounds: Bounds }[] = [
  { code: '971', label: 'Guadeloupe', bounds: [[-61.85, 15.8], [-61.0, 16.55]] },
  { code: '972', label: 'Martinique', bounds: [[-61.25, 14.35], [-60.75, 14.9]] },
  { code: '973', label: 'Guyane', bounds: [[-54.7, 2.1], [-51.5, 5.9]] },
  { code: '974', label: 'Réunion', bounds: [[55.15, -21.45], [55.9, -20.8]] },
  { code: '976', label: 'Mayotte', bounds: [[44.95, -13.05], [45.35, -12.6]] },
]
/**
 * Paris et la petite couronne, illisibles à l'échelle de la France : leur encart les agrandit, avant ceux de
 * l'outre-mer, comme sur la carte de l'accueil (CarteDepartements ; demande de l'auteur, 24/09). Codes de
 * département, qui sont aussi les débuts des codes INSEE de leurs communes.
 */
const PETITE_COURONNE = ['75', '92', '93', '94']

/** Écran sans survol (doigt) : l'info-bulle s'ouvre au toucher et le clic ne navigue pas d'emblée. */
function tactile(ev: Event | undefined): boolean {
  const type = (ev as PointerEvent | undefined)?.pointerType
  if (type) return type === 'touch' || type === 'pen'
  return window.matchMedia?.('(hover: none)').matches ?? false
}

/** Carte choroplèthe sans fond de carte externe : uniquement nos contours, lisible en clair, sombre et studio. */
export default function FranceMap({
  data,
  colorOf,
  labelOf,
  onClick,
  onHover,
  height = 560,
  selected,
  idKey = 'code',
  ariaLabel,
  bounds,
  inset = false,
  drom,
  etiquettes,
  message,
  actionLabel,
  encart,
  clicDirect = false,
}: Props) {
  // Entité choisie par un clic, quand la carte a un encart ; elle prime sur `selected` (survol du tableau voisin).
  const [choix, setChoix] = useState<string | null>(null)
  // Clic sur un département : sa fiche s'ouvre directement (choix de l'auteur, 2026-10-05, qui remplace l'encart du
  // 25/09) ; l'encart ne sert plus qu'aux cartes dont l'entité n'a pas de fiche.
  const naviguer = useNavigate()
  const choisir = useCallback(
    (p: Record<string, unknown>) => {
      const code = String(p[idKey] ?? '')
      const fiche = code && encart ? encart(code).fiche : undefined
      if (fiche) naviguer(fiche, { viewTransition: true })
      else setChoix(code)
    },
    [idKey, encart, naviguer],
  )
  const surClic = encart ? choisir : onClick
  const selection = encart && choix ? choix : selected
  const wrapRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  /**
   * Génération de la carte. Quand le navigateur perd le contexte WebGL (GPU repris par le système, trop de
   * contextes ouverts, onglet mis en veille sur mobile), MapLibre met `style` à null : tout appel suivant
   * lève une exception DANS un effet React, qui démontait la page entière, et le fond restait gris faute de
   * recoloration (diagnostiqué le 2026-09-22). On reconstruit alors la carte, au plus trois fois.
   */
  const [generation, setGeneration] = useState(0)
  const readyRef = useRef(false)
  const pendingRef = useRef<() => void>(() => {})
  const recolorRef = useRef<() => void>(() => {})
  const selectedRef = useRef<string | null | undefined>(selection)
  selectedRef.current = selection
  const dataRef = useRef<FeatureCollection | null>(data)
  dataRef.current = data
  const dejaRef = useRef<{ data: FeatureCollection | null; bounds?: Bounds }>({ data: null })
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const direct = !!encart || clicDirect
  const handlers = useRef({ colorOf, labelOf, onClick: surClic, onHover, actionLabel, direct })
  handlers.current = { colorOf, labelOf, onClick: surClic, onHover, actionLabel, direct }
  const [spansGlobe, setSpansGlobe] = useState(false)
  const [echec, setEchec] = useState(false)
  // Perte du contexte WebGL qui ne se rétablit pas (onglet resté longtemps en arrière-plan, GPU qui ne
  // revient pas) : webglcontextlost seul ne dit rien à l'utilisateur, qui se retrouvait devant une carte
  // figée et muette indéfiniment (revue du 2026-09-22).
  const [pertePersistante, setPertePersistante] = useState(false)
  const perteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Carte peinte au moins une fois avec ses données : jusque-là, le voile « Chargement de la carte… » reste (critique UX
  // du 2026-10-05 : la carte des services restait blanche plusieurs secondes, sans indication).
  const [peinte, setPeinte] = useState(false)
  // Affichage des noms : choix de l'utilisateur (demande de l'auteur, 2026-09-22), mémorisé d'une carte
  // et d'une visite à l'autre. Sur une carte dense, les masquer laisse voir les couleurs.
  const [noms, basculerNoms] = useReglageCarte('carte-noms')

  // Encarts de Paris et de l'outre-mer : affichés par défaut, masquables par le bouton « Encarts » (choix de l'auteur,
  // 27/09), mémorisés comme les noms et partagés avec la carte de l'accueil (CarteDepartements).
  const [encartsVus, basculerEncarts] = useReglageCarte('carte-encarts')

  const mode: 'departements' | 'communes' | false = inset ? false : (etiquettes ?? ((data?.features.length ?? 0) > 150 ? 'communes' : 'departements'))

  /**
   * Tout appel à MapLibre passe par ici : un style à demi démonté (carte retirée, source disparue,
   * contexte WebGL perdu) lève une exception DANS un effet React, et React, faute de garde, démonte alors
   * la page entière — écran blanc. Constaté le 2026-09-22 sur la fiche de département. La carte cède
   * désormais la place à son équivalent textuel ; le reste de la page reste debout.
   */
  const sansCasse = useCallback((quoi: string, fn: () => void) => {
    try {
      fn()
    } catch (err) {
      // On journalise sans déclarer la carte en panne : ces échecs sont passagers (un appel arrive sur un
      // style déjà démonté pendant un changement de page) et le rendu suivant repeint correctement.
      // « Carte indisponible » reste réservé au vrai cas sans WebGL, détecté à la construction.
      console.error(`[FranceMap] ${quoi}`, err)
    }
  }, [])
  /**
   * Relit systématiquement `mapRef.current` au lieu de capturer `map` dans une fermeture : une fermeture
   * posée par un effet (setTimeout, .then, listener MapLibre) peut s'exécuter après qu'une nouvelle
   * génération de carte a remplacé l'ancienne (perte de contexte WebGL, §carte()) — sans ça, elle agirait
   * sur une instance détruite. Un seul point de vérité pour tous les effets du fichier (revue du 2026-09-22).
   */
  const carte = useCallback(() => mapRef.current, [])

  useEffect(() => {
    if (!ref.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': cssVar(inset ? '--surface' : '--bg') } }] },
        center: [2.5, 46.6],
        zoom: 5,
        attributionControl: false,
        dragRotate: false,
        // Page longue : la molette fait défiler la page, Ctrl + molette (deux doigts au toucher) zoome la carte.
        cooperativeGestures: !inset,
        locale: LOCALE,
        scrollZoom: !inset,
        dragPan: !inset,
        doubleClickZoom: !inset,
        touchZoomRotate: !inset,
        keyboard: !inset,
      })
    } catch (err) {
      // Sans WebGL, MapLibre lève une exception : sans ce garde, toute la page tombait avec elle.
      console.error('[FranceMap]', err)
      setEchec(true)
      return
    }
    // Encart d'outre-mer : masqué aux lecteurs d'écran (aria-hidden) et doublé par les boutons de
    // territoire, son canevas ne doit pas non plus recevoir le focus clavier (étude UX du 23/09).
    if (inset) map.getCanvas().tabIndex = -1
    if (!inset) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Contours Etalab / IGN' }))
      // MapLibre ouvre la mention compacte au démarrage : ouverte, elle recouvrait l'étiquette « Mayotte »
      // des encarts sur les cartes étroites. Repliée, elle reste accessible par le bouton « i ».
      map.once('load', () => ref.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    }
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, maxWidth: '280px' })
    popupRef.current = popup

    /** Info-bulle ; au toucher, elle porte le lien qui remplace le clic. */
    const montrer = (lngLat: maplibregl.LngLat, props: Record<string, unknown>, avecAction: boolean) => {
      const label = handlers.current.labelOf?.(props)
      if (!label) return false
      const el = document.createElement('div')
      el.className = 'map-tip'
      el.innerHTML = label
      if (avecAction && handlers.current.onClick) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'btn-link map-tip-action'
        b.textContent = handlers.current.actionLabel ?? 'Ouvrir la fiche →'
        b.addEventListener('click', () => handlers.current.onClick?.(props))
        el.appendChild(b)
      }
      popup.setLngLat(lngLat).setDOMContent(el).addTo(map)
      return true
    }

    // Seul l'état React change ici : aucun appel à l'instance (règle du fichier, §carte()).
    map.on('idle', () => {
      if (dataRef.current) setPeinte(true)
    })

    map.on('load', () => {
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Source des libellés : la plus grande partie de chaque entité, sans quoi un département à îles
      // (Finistère, Morbihan, Vendée, Var…) portait son numéro deux ou trois fois.
      map.addSource('etiquettes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Opacité pleine : sans fond de carte dessous, 0,9 éclaircissait chaque couleur par rapport à sa légende (audit du 27/09).
      map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', '__color'], 'fill-opacity': 1 } })
      const motif = motifHachures()
      if (motif) {
        map.addImage('hachures', motif, { pixelRatio: 2 })
        map.addLayer({ id: 'zones-hachures', type: 'fill', source: 'zones', paint: { 'fill-pattern': 'hachures' }, filter: ['==', ['get', '__nd'], true] })
      }
      map.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': cssVar('--surface'), 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 9, 0.8] },
      })
      // Contour de sélection doublé d'un liseré clair : seul, le trait sombre disparaissait sur le palier le plus foncé.
      map.addLayer({ id: 'zones-selected-halo', type: 'line', source: 'zones', paint: { 'line-color': cssVar('--surface'), 'line-width': 5 }, filter: ['==', ['get', idKey], ''] })
      map.addLayer({ id: 'zones-selected', type: 'line', source: 'zones', paint: { 'line-color': cssVar('--text'), 'line-width': 2.2 }, filter: ['==', ['get', idKey], ''] })
      map.on('mousemove', 'zones-fill', (e) => {
        const f = e.features?.[0]
        if (!f || !dataRef.current || tactile(e.originalEvent)) return
        // Main seulement si le clic fait quelque chose (revue du 2026-09-22).
        map.getCanvas().style.cursor = handlers.current.onClick ? 'pointer' : ''
        handlers.current.onHover?.(f.properties ?? {})
        const label = handlers.current.labelOf?.(f.properties ?? {})
        if (label) popup.setLngLat(e.lngLat).setHTML(`<div class="map-tip">${label}</div>`).addTo(map)
      })
      map.on('mouseleave', 'zones-fill', () => {
        map.getCanvas().style.cursor = ''
        handlers.current.onHover?.(null)
        popup.remove()
      })
      map.on('click', (e) => {
        const f = dataRef.current ? entiteSous(map, e.point) : undefined
        if (!f) {
          popup.remove()
          return
        }
        const props = f.properties ?? {}
        // Carte à encart : le toucher sélectionne comme le clic, l'encart donnant la valeur et les liens.
        if (!handlers.current.direct && tactile(e.originalEvent) && montrer(e.lngLat, props, true)) {
          handlers.current.onHover?.(props)
          return
        }
        if (handlers.current.direct) popup.remove()
        handlers.current.onClick?.(props)
      })
      readyRef.current = true
      // La sélection peut avoir été demandée avant la fin du chargement (URL ouverte directement sur un département).
      const filtre: maplibregl.FilterSpecification = ['==', ['get', idKey], selectedRef.current ?? '']
      map.setFilter('zones-selected', filtre)
      map.setFilter('zones-selected-halo', filtre)
      map.fire(PRETE)
    })
    mapRef.current = map
    if (!inset) (window as unknown as { __robinetMap?: maplibregl.Map }).__robinetMap = map // débogage et outillage studio
    map.on('error', (e) => console.error('[FranceMap]', e.error ?? e))
    map.on('webglcontextlost', () => {
      readyRef.current = false
      dejaRef.current = { data: null }
      if (perteTimer.current) clearTimeout(perteTimer.current)
      // 8 s : largement plus qu'un changement d'onglet ou un GPU repris brièvement, pour ne pas afficher
      // le message à tort pendant un simple sursaut ; en dessous de ça, le rétablissement passe inaperçu.
      perteTimer.current = setTimeout(() => setPertePersistante(true), 8000)
    })
    map.on('webglcontextrestored', () => {
      if (perteTimer.current) clearTimeout(perteTimer.current)
      setPertePersistante(false)
      setGeneration((g) => (g < 3 ? g + 1 : g))
    })
    const mo = new MutationObserver(() => {
      if (!readyRef.current) return
      try {
      map.setPaintProperty('bg', 'background-color', cssVar(inset ? '--surface' : '--bg'))
      const motif = motifHachures()
      if (motif && map.hasImage('hachures')) map.updateImage('hachures', motif)
      map.setPaintProperty('zones-line', 'line-color', cssVar('--surface'))
      map.setPaintProperty('zones-selected-halo', 'line-color', cssVar('--surface'))
      map.setPaintProperty('zones-selected', 'line-color', cssVar('--text'))
      if (map.getLayer('zones-label')) {
        map.setPaintProperty('zones-label', 'text-color', cssVar('--text'))
        map.setPaintProperty('zones-label', 'text-halo-color', cssVar('--surface'))
      }
        recolorRef.current() // la palette séquentielle dépend du thème : on recolore sans recadrer
      } catch (err) {
        console.error('[FranceMap] thème', err)
      }
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => {
      mo.disconnect()
      if (perteTimer.current) clearTimeout(perteTimer.current)
      if ((window as unknown as { __robinetMap?: maplibregl.Map }).__robinetMap === map) {
        delete (window as unknown as { __robinetMap?: maplibregl.Map }).__robinetMap
      }
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  // Libellés : couche ajoutée une fois la police chargée (TinySDF dessine avec la police disponible à
  // l'instant ; trop tôt, il figerait la police de repli dans son cache).
  useEffect(() => {
    if (!carte() || !mode) return
    let annule = false
    const poser = () => {
      void chargerPolice().then(() => {
        // carte() relue ici, pas la variable capturée à l'ouverture de l'effet (même motif que l'effet
        // données ci-dessous) : entre la pose de cette promesse et sa résolution, la carte peut avoir été
        // recréée après une perte de contexte WebGL (revue du 2026-09-22).
        const map = carte()
        if (annule || !map) return
        sansCasse('libellés', () => {
          // Des noms, pas des numéros (demande de l'auteur, 2026-09-22) : lisibles par tous. Les noms longs
          // passent à la ligne ; ceux qui se chevauchent sont écartés par MapLibre et reviennent en zoomant.
          const field: maplibregl.ExpressionSpecification = ['get', 'nom']
          const size: maplibregl.ExpressionSpecification =
            mode === 'departements' ? ['interpolate', ['linear'], ['zoom'], 4, 9, 6, 11, 8, 13] : ['interpolate', ['linear'], ['zoom'], 7, 10, 10, 12.5]
          if (map.getLayer('zones-label')) map.removeLayer('zones-label')
          map.addLayer({
            id: 'zones-label',
            type: 'symbol',
            source: 'etiquettes',
            minzoom: mode === 'communes' ? 7 : 0,
            layout: { 'text-field': field, 'text-font': [POLICE], 'text-size': size, 'text-max-width': mode === 'departements' ? 6 : 7, 'text-padding': 2, 'text-line-height': 1.1, 'symbol-placement': 'point', 'symbol-sort-key': ['-', 0, ['get', '__aire']] },
            paint: { 'text-color': cssVar('--text'), 'text-halo-color': cssVar('--surface'), 'text-halo-width': 2, 'text-halo-blur': 0.2 },
          })
          map.setLayoutProperty('zones-label', 'visibility', noms ? 'visible' : 'none')
        })
      })
    }
    if (readyRef.current) poser()
    else carte()?.once(PRETE, poser)
    return () => {
      annule = true
    }
  }, [mode, noms, sansCasse, carte, generation])

  // Bouton « Noms » : on masque la couche plutôt que de la retirer, pour ne pas redessiner les glyphes.
  useEffect(() => {
    if (!carte() || !readyRef.current) return
    sansCasse('bouton Noms', () => {
      const map = carte()
      if (map?.getLayer('zones-label')) map.setLayoutProperty('zones-label', 'visibility', noms ? 'visible' : 'none')
    })
  }, [noms, mode, data, sansCasse, carte, generation])

  /** Cadrage : marges qui laissent la métropole hors des boutons de territoire (haut) et des encarts (bas). */
  const recadrer = (fc: FeatureCollection) => {
    const map = mapRef.current
    if (!map) return
    if (bounds) {
      map.fitBounds(bounds, { padding: inset ? 4 : 24, duration: 0 })
      return
    }
    const b = bbox(fc.features)
    if (!b) return
    // Avec les DROM, l'emprise couvre la moitié du globe : on cadre la métropole et on propose les territoires.
    const globe = b[1][0] - b[0][0] > 40
    setSpansGlobe(globe)
    const wrap = wrapRef.current
    const boutons = wrap?.querySelector<HTMLElement>('.map-territoires')
    const encarts = wrap?.querySelector<HTMLElement>('.map-insets')
    const encartsSurCarte = encarts && getComputedStyle(encarts).position === 'absolute'
    const padding = globe
      ? { top: (boutons?.offsetHeight ?? 32) + 16, bottom: encartsSurCarte ? encarts.offsetHeight + 16 : 24, left: 24, right: 48 }
      : 24
    map.fitBounds(globe ? METROPOLE : b, { padding, duration: 400, maxZoom: 11 })
  }

  // Données et couleurs. Changer de données (ou d'emprise) recolore ET recadre ; changer seulement de
  // couleurs (indicateur, millésime) recolore sans toucher au zoom choisi par l'utilisateur.
  useEffect(() => {
    if (!mapRef.current) return
    // carte() (déclaré au niveau du composant) est relue à CHAQUE appel, jamais capturée : recolor() et
    // apply() sont rappelés plus tard par les évènements de MapLibre, et une carte remplacée entre-temps
    // laissait ces fermetures peindre sur un style démonté — la page tombait, et le fond restait gris (2026-09-22).
    const src = () => carte()?.getSource('zones') as maplibregl.GeoJSONSource | undefined
    const srcEtiquettes = () => carte()?.getSource('etiquettes') as maplibregl.GeoJSONSource | undefined
    if (!data) {
      // Pendant un chargement, l'ancien fond ne doit plus répondre au clic (il ouvrait une fiche inexistante).
      popupRef.current?.remove()
      if (readyRef.current)
        sansCasse('vidage', () => {
          src()?.setData({ type: 'FeatureCollection', features: [] })
          srcEtiquettes()?.setData({ type: 'FeatureCollection', features: [] })
        })
      dejaRef.current = { data: null }
      return
    }
    const recolor = () =>
      sansCasse('couleurs', () => {
        if (!carte() || !readyRef.current) return
        // L'info-bulle décrit l'entité survolée ; en changeant de couleurs elle parlerait de l'ancien état.
        popupRef.current?.remove()
        // Couleur « sans donnée » des échelles (lib/scale.ts) : l'entité reçoit en plus le motif hachuré (__nd).
        const sans = noData()
        src()?.setData({
          type: 'FeatureCollection',
          features: data.features.map((f) => {
            const couleur = handlers.current.colorOf(f.properties ?? {})
            return { ...f, properties: { ...f.properties, __color: couleur, __nd: couleur === sans } }
          }),
        })
      })
    recolorRef.current = recolor
    const apply = () =>
      sansCasse('données', () => {
        if (!carte() || !readyRef.current) return
        const deja = dejaRef.current
        const nouveau = deja.data !== data || deja.bounds !== bounds
        recolor()
        if (nouveau) {
          srcEtiquettes()?.setData(plusGrandesParties(data))
          recadrer(data)
        }
        dejaRef.current = { data, bounds }
      })
    if (readyRef.current) apply()
    else {
      // Avant le chargement de la carte, on ne garde que la dernière demande.
      mapRef.current.off(PRETE, pendingRef.current)
      pendingRef.current = apply
      mapRef.current.once(PRETE, apply)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, colorOf, bounds, inset, generation])

  // Les encarts apparaissent après le premier cadrage (on apprend alors que les données couvrent
  // l'outre-mer) : on recadre une fois qu'ils occupent leur place.
  // Même chose quand on les masque ou les réaffiche : la métropole reprend ou cède la place qu'ils occupent.
  useEffect(() => {
    if (spansGlobe && dataRef.current && readyRef.current) recadrer(dataRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spansGlobe, encartsVus])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    sansCasse('sélection', () => {
      const filtre: maplibregl.FilterSpecification = ['==', ['get', idKey], selection ?? '']
      map.setFilter('zones-selected', filtre)
      map.setFilter('zones-selected-halo', filtre)
    })
  }, [selection, idKey, sansCasse, generation])

  // Encart : Échap le ferme ; une carte qui perd son encart (autre vue de la même page) oublie le choix.
  useEffect(() => {
    if (!choix) return
    const fermer = (e: KeyboardEvent) => e.key === 'Escape' && setChoix(null)
    document.addEventListener('keydown', fermer)
    return () => document.removeEventListener('keydown', fermer)
  }, [choix])
  useEffect(() => {
    if (!encart) setChoix(null)
  }, [encart])

  const encartsPossibles = !inset && spansGlobe && (drom ?? (data?.features.length ?? 0) < 5000)
  const showInsets = encartsPossibles && encartsVus
  // Chaque encart ne reçoit que les entités de son territoire (au lieu du fichier national entier, sept fois).
  // Celui de la petite couronne est cadré sur l'emprise de ses départements.
  const encarts = useMemo(() => {
    const liste: { code: string; label: string; bounds: Bounds; fc: FeatureCollection }[] = []
    if (!data || !showInsets) return liste
    const entites = (prefixes: string[]): FeatureCollection => ({
      type: 'FeatureCollection',
      features: data.features.filter((f) => prefixes.some((p) => String(f.properties?.[idKey] ?? '').startsWith(p))),
    })
    const idf = entites(PETITE_COURONNE)
    const cadre = bbox(idf.features)
    if (cadre) liste.push({ code: 'idf', label: 'Paris et petite couronne', bounds: cadre, fc: idf })
    for (const t of TERRITOIRES) liste.push({ ...t, fc: entites([t.code]) })
    return liste
  }, [data, showInsets, idKey])

  const voile = echec
    ? 'La carte ne peut pas s’afficher dans ce navigateur, où WebGL est désactivé. Les valeurs figurent dans le tableau voisin.'
    : pertePersistante
      ? 'L’affichage de la carte a été interrompu et ne s’est pas rétabli. Les valeurs du tableau voisin restent exactes. Rechargez la page pour afficher de nouveau la carte.'
      : !inset && message
      ? message
      : !inset && (!data || !peinte)
        ? 'Chargement de la carte…'
        : null

  // Encart de l'entité choisie : sa valeur telle que l'info-bulle l'écrit, pour les données affichées (année, indicateur).
  const proprietesChoix = encart && choix && data ? (data.features.find((f) => String(f.properties?.[idKey] ?? '') === choix)?.properties ?? null) : null
  // Un encart descend toujours d'un niveau : sans vue communale, vers les communes sur la qualité de l'eau (lib/parcours).
  const liensChoix = proprietesChoix && encart ? liensAvecCommunes(encart(choix!), choix!) : null
  const communesChoix = liensChoix?.communes
  const encartCarte = liensChoix && (
    <EncartCarte
      texte={labelOf?.(proprietesChoix!) ?? ''}
      // « Voir ses communes » sur la même carte : l'encart se ferme, la carte passe aux communes.
      liens={
        typeof communesChoix === 'function'
          ? {
              ...liensChoix,
              communes: () => {
                setChoix(null)
                communesChoix()
              },
            }
          : liensChoix
      }
      onFermer={() => setChoix(null)}
    />
  )

  return (
    <>
    <div
      ref={wrapRef}
      className={`map-wrap${inset ? ' map-inset' : ''}`}
      style={{ position: 'relative' }}
      role={inset ? undefined : 'region'}
      aria-label={inset ? undefined : (ariaLabel ?? 'Carte choroplèthe ; la valeur de chaque zone s’affiche au survol ou au toucher.')}
    >
      <div ref={ref} className="map" style={{ height }} aria-hidden={inset || undefined} />
      {voile && (
        <div className="map-voile" role="status">
          <span>{voile}</span>
        </div>
      )}
      {!inset && (spansGlobe || mode) && (
        <div className="map-territoires" aria-label="Réglages de la carte">
          {spansGlobe &&
            [{ label: 'Métropole', bounds: METROPOLE }, ...TERRITOIRES].map((t) => (
              <button key={t.label} type="button" onClick={() => mapRef.current?.fitBounds(t.bounds, { padding: 24, duration: 500, maxZoom: 11 })}>
                {t.label}
              </button>
            ))}
          {mode && (
            <button
              type="button"
              className={noms ? 'on' : undefined}
              aria-pressed={noms}
              title={noms ? 'Masquer les noms sur la carte' : 'Afficher les noms sur la carte'}
              onClick={basculerNoms}
            >
              Noms
            </button>
          )}
          {encartsPossibles && (
            <button
              type="button"
              className={encartsVus ? 'on' : undefined}
              aria-pressed={encartsVus}
              title={encartsVus ? 'Masquer les encarts de Paris et de l’outre-mer' : 'Afficher les encarts de Paris et de l’outre-mer'}
              onClick={basculerEncarts}
            >
              Encarts
            </button>
          )}
        </div>
      )}
      {showInsets && (
        <div className="map-insets" aria-label="Encarts : Paris et petite couronne, outre-mer">
          {encarts.map((t) => (
            <div key={t.code} className="map-inset-box">
              <FranceMap
                data={t.fc}
                colorOf={colorOf}
                labelOf={labelOf}
                onClick={surClic}
                onHover={onHover}
                actionLabel={actionLabel}
                clicDirect={direct}
                height="100%"
                bounds={t.bounds}
                inset
                idKey={idKey}
                selected={selection}
                ariaLabel={`Encart ${t.label}`}
              />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    {encartCarte}
    </>
  )
}

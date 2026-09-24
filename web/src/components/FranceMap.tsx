import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { cssVar } from '../lib/theme'

export type Bounds = [[number, number], [number, number]]

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
 * Police des libellés. Le style ne déclare pas de fichiers de glyphes : MapLibre dessine alors le texte
 * lui-même avec une police de la page (TinySDF). Il déduit la graisse du NOM de la police, d'où cet
 * alias d'Atkinson Hyperlegible Next (servie avec le site) déclaré en semi-gras : le fichier est variable,
 * le navigateur en tire la graisse 600.
 */
const POLICE = 'Robinet Carte SemiBold'
/** Atkinson Hyperlegible Next, la police de texte de la plateforme (charte « Vigilance + instruments »). */
const POLICE_FICHIER = '/fonts/atkinson/next.woff2'
let policePrete: Promise<void> | null = null
function chargerPolice(): Promise<void> {
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
const LOCALE = {
  'Map.Title': 'Carte',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'AttributionControl.ToggleAttribution': 'Afficher ou masquer les sources',
  'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer la carte',
  'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte',
}

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
}: Props) {
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
  const selectedRef = useRef<string | null | undefined>(selected)
  selectedRef.current = selected
  const dataRef = useRef<FeatureCollection | null>(data)
  dataRef.current = data
  const dejaRef = useRef<{ data: FeatureCollection | null; bounds?: Bounds }>({ data: null })
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const handlers = useRef({ colorOf, labelOf, onClick, onHover, actionLabel })
  handlers.current = { colorOf, labelOf, onClick, onHover, actionLabel }
  const [spansGlobe, setSpansGlobe] = useState(false)
  const [echec, setEchec] = useState(false)
  // Perte du contexte WebGL qui ne se rétablit pas (onglet resté longtemps en arrière-plan, GPU qui ne
  // revient pas) : webglcontextlost seul ne dit rien à l'utilisateur, qui se retrouvait devant une carte
  // figée et muette indéfiniment (revue du 2026-09-22).
  const [pertePersistante, setPertePersistante] = useState(false)
  const perteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Affichage des noms : choix de l'utilisateur (demande de l'auteur, 2026-09-22), mémorisé d'une carte
  // et d'une visite à l'autre. Sur une carte dense, les masquer laisse voir les couleurs.
  const [noms, setNoms] = useState<boolean>(() => {
    try {
      return localStorage.getItem('carte-noms') !== '0'
    } catch {
      return true
    }
  })

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

    map.on('load', () => {
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Source des libellés : la plus grande partie de chaque entité, sans quoi un département à îles
      // (Finistère, Morbihan, Vendée, Var…) portait son numéro deux ou trois fois.
      map.addSource('etiquettes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', '__color'], 'fill-opacity': 0.9 } })
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
        const f = dataRef.current ? map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] })[0] : undefined
        if (!f) {
          popup.remove()
          return
        }
        const props = f.properties ?? {}
        if (tactile(e.originalEvent) && montrer(e.lngLat, props, true)) {
          handlers.current.onHover?.(props)
          return
        }
        handlers.current.onClick?.(props)
      })
      readyRef.current = true
      // La sélection peut avoir été demandée avant la fin du chargement (URL ouverte directement sur un département).
      const filtre: maplibregl.FilterSpecification = ['==', ['get', idKey], selectedRef.current ?? '']
      map.setFilter('zones-selected', filtre)
      map.setFilter('zones-selected-halo', filtre)
      map.fire('robinet:ready')
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
            paint: { 'text-color': cssVar('--text'), 'text-halo-color': cssVar('--surface'), 'text-halo-width': 1.5, 'text-halo-blur': 0.4 },
          })
          map.setLayoutProperty('zones-label', 'visibility', noms ? 'visible' : 'none')
        })
      })
    }
    if (readyRef.current) poser()
    else carte()?.once('robinet:ready', poser)
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
        src()?.setData({
          type: 'FeatureCollection',
          features: data.features.map((f) => ({ ...f, properties: { ...f.properties, __color: handlers.current.colorOf(f.properties ?? {}) } })),
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
      mapRef.current.off('robinet:ready', pendingRef.current)
      pendingRef.current = apply
      mapRef.current.once('robinet:ready', apply)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, colorOf, bounds, inset, generation])

  // Les encarts apparaissent après le premier cadrage (on apprend alors que les données couvrent
  // l'outre-mer) : on recadre une fois qu'ils occupent leur place.
  useEffect(() => {
    if (spansGlobe && dataRef.current && readyRef.current) recadrer(dataRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spansGlobe])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    sansCasse('sélection', () => {
      const filtre: maplibregl.FilterSpecification = ['==', ['get', idKey], selected ?? '']
      map.setFilter('zones-selected', filtre)
      map.setFilter('zones-selected-halo', filtre)
    })
  }, [selected, idKey, sansCasse, generation])

  const showInsets = !inset && spansGlobe && (drom ?? (data?.features.length ?? 0) < 5000)
  // Chaque encart ne reçoit que les entités de son territoire (au lieu du fichier national entier, six fois).
  const parTerritoire = useMemo(() => {
    const m = new Map<string, FeatureCollection>()
    if (!data || !showInsets) return m
    for (const t of TERRITOIRES) {
      m.set(t.code, { type: 'FeatureCollection', features: data.features.filter((f) => String(f.properties?.[idKey] ?? '').startsWith(t.code)) })
    }
    return m
  }, [data, showInsets, idKey])

  const voile = echec
    ? 'Carte indisponible dans ce navigateur (WebGL désactivé) : les valeurs figurent dans le tableau voisin.'
    : pertePersistante
      ? 'La carte a perdu son affichage et ne s’est pas rétablie : les valeurs restent justes dans le tableau voisin ; rechargez la page pour la retrouver.'
      : !inset && message
      ? message
      : !inset && !data
        ? 'Chargement de la carte…'
        : null

  return (
    <div
      ref={wrapRef}
      className={`map-wrap${inset ? ' map-inset' : ''}`}
      style={{ position: 'relative' }}
      role={inset ? undefined : 'region'}
      aria-label={inset ? undefined : (ariaLabel ?? 'Carte choroplèthe ; valeur de chaque zone au survol ou au toucher.')}
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
              onClick={() => {
                setNoms((v) => {
                  try {
                    localStorage.setItem('carte-noms', v ? '0' : '1')
                  } catch {
                    /* stockage indisponible : le choix vaut pour cette visite */
                  }
                  return !v
                })
              }}
            >
              Noms
            </button>
          )}
        </div>
      )}
      {showInsets && (
        <div className="map-insets" aria-label="Outre-mer">
          {TERRITOIRES.map((t) => (
            <div key={t.code} className="map-inset-box">
              <FranceMap
                data={parTerritoire.get(t.code) ?? null}
                colorOf={colorOf}
                labelOf={labelOf}
                onClick={onClick}
                onHover={onHover}
                actionLabel={actionLabel}
                height="100%"
                bounds={t.bounds}
                inset
                idKey={idKey}
                selected={selected}
                ariaLabel={`Encart ${t.label}`}
              />
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Aire (en degrés², pour comparer) d'un anneau. */
function aire(anneau: Position[]): number {
  let a = 0
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) a += (anneau[j][0] + anneau[i][0]) * (anneau[j][1] - anneau[i][1])
  return Math.abs(a / 2)
}

/** Chaque entité réduite à sa plus grande partie, pour n'y poser qu'un libellé. */
function plusGrandesParties(fc: FeatureCollection): FeatureCollection {
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

function bbox(features: Feature<Geometry | null>[]): Bounds | null {
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

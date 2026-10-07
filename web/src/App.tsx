import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Chargement from './components/Chargement'
import Search from './components/Search'
import Partage from './components/Partage'
import { useStageScale, useStudio } from './lib/studio'
import { useTablesDefilantes } from './lib/tablesDefilantes'
import { useTheme } from './lib/theme'
import { CITATION, CONCEPTION, LICENCE } from './lib/citation'
import { MENU, sectionDe } from './lib/parcours'

// Chaque page est chargée à la demande : ECharts et MapLibre ne pèsent pas sur la première visite.
const Home = lazy(() => import('./pages/Home'))
const France = lazy(() => import('./pages/France'))
const Carte = lazy(() => import('./pages/Carte'))
const Commune = lazy(() => import('./pages/Commune'))
const Themes = lazy(() => import('./pages/Themes'))
const Theme = lazy(() => import('./pages/Theme'))
const Plomb = lazy(() => import('./pages/Plomb'))
const Services = lazy(() => import('./pages/Services'))
const Amont = lazy(() => import('./pages/Amont'))
const Analyses = lazy(() => import('./pages/Analyses'))
const Service = lazy(() => import('./pages/Service'))
const Departement = lazy(() => import('./pages/Departement'))
const Reseau = lazy(() => import('./pages/Reseau'))
const Secheresse = lazy(() => import('./pages/Secheresse'))
const Avis = lazy(() => import('./pages/Avis'))
const HorsGrille = lazy(() => import('./pages/HorsGrille'))
const Nappes = lazy(() => import('./pages/Nappes'))
const Ressource = lazy(() => import('./pages/Ressource'))
const RessourceEnEau = lazy(() => import('./pages/RessourceEnEau'))
const Methode = lazy(() => import('./pages/Methode'))
const Mentions = lazy(() => import('./pages/Mentions'))
const MaCommune = lazy(() => import('./pages/MaCommune'))
const Scene = lazy(() => import('./pages/Scene'))
const NotFound = lazy(() => import('./pages/NotFound'))

/**
 * Retour en haut de page à chaque changement de page (revue du 2026-09-22) : sans lui, un clic en bas
 * de l'accueil ouvrait la page suivante au même niveau de défilement, donc souvent en bas. Une ancre
 * (#section) est respectée ; les changements de paramètres (?annee=…) ne font pas défiler.
 * `useLayoutEffect`, pas `useEffect` (transitions de page, 2026-09-22 soir) : la capture de l'état
 * « après » par `document.startViewTransition` (déclenché par React Router via `viewTransition` sur
 * les liens) arrive avant que les effets passifs ne s'exécutent — en `useEffect`, la page transitionnait
 * encore à l'ancienne position de défilement puis sautait au sommet après coup.
 */
/**
 * Section active de la barre (revue ergonomie, 2026-09-23) : `NavLink` ne marque « Cartes » actif que
 * sur `/carte` exactement, pas sur `/departement/:dd` — ce sont deux routes indépendantes, pas une
 * imbriquée sous l'autre. Le visiteur perdait le repère « où je suis » dès qu'il cliquait une commune
 * ou un département. Même découpage que l'eyebrow de chaque page (pages/*.tsx) : les deux doivent
 * rester synchronisés si une page change de section.
 *
 * Fiches (choix de l'auteur, 2026-09-25, relevé « Parcours du robinet ») : commune, analyses, réseau et service d'eau
 * allument toutes « Mon eau », dont la recherche les trouve toutes.
 *
 * Menu de la refonte (lot 2, choix de l'auteur du 2026-10-05) : Mon eau, La France, Sujets, La ressource, Méthode. La
 * fiche département passe sous « La France » (la carte, qu'elle détaille) ; les avis de l'ARS et le hors grille sous
 * « Sujets » ; la sécheresse, les nappes, la pression sur la ressource, l'amont et les services d'eau sous « La ressource ».
 * Calcul : `sectionDe` (lib/parcours.ts, testé) ; l'eyebrow de chaque page (pages/*.tsx) porte le même nom de section.
 */

/**
 * Barrière d'erreur (étude UX du 23/09) : sans elle, un fichier de code introuvable laissait une page
 * blanche — cas type juste après un déploiement, pour un onglet ouvert avant (les anciens fichiers
 * disparaissent de gh-pages). Remise à zéro à chaque changement de page (`key` posée par App).
 */
class BarriereErreur extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false }
  static getDerivedStateFromError() {
    return { erreur: true }
  }
  render() {
    if (!this.state.erreur) return this.props.children
    return (
      <div className="page">
        <div className="card note" role="alert">
          <h2>Cette page n'a pas pu s'afficher</h2>
          <p>Une nouvelle version du site a probablement été publiée pendant votre visite. Le rechargement de la page résout généralement le problème.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      </div>
    )
  }
}

function RetourEnHaut() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // La cible d'une ancre n'existe souvent qu'après le chargement de la page ou de ses données (section d'une fiche
    // département ouverte depuis une page à sujet, règle de la Méthode) : cherchée au seul moment de la navigation, elle
    // manquait, et la page s'ouvrait en haut, la section dépliée hors de vue (vérification du 25/09). On la guette donc
    // quelques secondes et on la ramène sous l'en-tête à chaque changement de la page (contenu chargé, carte ou graphique
    // dimensionnés), jusqu'à ce que le visiteur prenne la main (molette, toucher, clavier, clic).
    const id = decodeURIComponent(hash.slice(1))
    let fini = false
    const viser = () => {
      if (!fini) document.getElementById(id)?.scrollIntoView()
    }
    if (document.getElementById(id)) viser()
    else window.scrollTo(0, 0)
    const main = () => {
      fini = true
    }
    const gestes = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
    gestes.forEach((g) => window.addEventListener(g, main, { passive: true }))
    const guet = new MutationObserver(viser)
    guet.observe(document.body, { childList: true, subtree: true })
    const taille = new ResizeObserver(viser)
    taille.observe(document.body)
    const arret = () => {
      fini = true
      guet.disconnect()
      taille.disconnect()
      gestes.forEach((g) => window.removeEventListener(g, main))
    }
    const fin = setTimeout(arret, 6000)
    return () => {
      arret()
      clearTimeout(fin)
    }
  }, [pathname, hash])
  return null
}

/**
 * Changement de page (audit UI UX Pro Max du 2026-10-06) : le focus passe au contenu, pour que la tabulation suivante parte
 * de la nouvelle page et non du lien du menu, et le titre de la page est annoncé aux lecteurs d'écran, qui ne disaient rien.
 * Le titre est celui qu'écrit la page (usePageTitle), parfois après ses données : il est attendu deux secondes au plus.
 */
function AnnonceDePage() {
  const { pathname } = useLocation()
  const [annonce, setAnnonce] = useState('')
  // Adresse précédente, pas un drapeau « premier rendu » : en développement, React exécute deux fois l'effet du montage, et
  // le focus partait au contenu dès l'ouverture de la page, sautant le lien d'évitement.
  const precedente = useRef(pathname)
  useEffect(() => {
    if (precedente.current === pathname) return
    precedente.current = pathname
    document.getElementById('contenu')?.focus({ preventScroll: true })
    const avant = document.title
    let fini = false
    const dire = () => {
      if (fini) return
      fini = true
      setAnnonce(document.title.replace(/ · Météo du robinet$/, ''))
    }
    const titre = document.querySelector('title')
    const guet = new MutationObserver(() => {
      if (document.title !== avant) setTimeout(dire, 300)
    })
    if (titre) guet.observe(titre, { childList: true, characterData: true, subtree: true })
    const secours = setTimeout(dire, 2000)
    return () => {
      fini = true
      guet.disconnect()
      clearTimeout(secours)
    }
  }, [pathname])
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {annonce}
    </p>
  )
}

/** Lien d'évitement : le premier arrêt du clavier mène au contenu, sans passer par les neuf du bandeau. */
function LienEvitement() {
  return (
    <a
      className="evitement"
      href="#contenu"
      onClick={(e) => {
        e.preventDefault()
        const main = document.getElementById('contenu')
        main?.focus({ preventScroll: true })
        main?.scrollIntoView()
      }}
    >
      Aller au contenu
    </a>
  )
}

export default function App() {
  const [studio] = useStudio()
  const scale = useStageScale(studio)
  const { pathname } = useLocation()
  const section = sectionDe(pathname)
  const [theme, setTheme] = useTheme()
  // Menu mobile (maquette du 23/09) : sous 1100 px, la recherche et la navigation passent dans un panneau ouvert
  // par le bouton « Menu » ; il se referme à chaque changement de page et à la touche Échap.
  const [menu, setMenu] = useState(false)
  const boutonMenu = useRef<HTMLButtonElement>(null)
  useEffect(() => setMenu(false), [pathname])
  // L'accueil et « Mon eau » ont leur propre champ de recherche : pas de second champ dans l'en-tête.
  const rechercheEnTete = pathname !== '/' && pathname !== '/ma-commune'
  useTablesDefilantes()
  const liens = [
    ...MENU.map(([to, texte]) => (
      <Link key={to} to={to} viewTransition className={section === to ? 'active' : undefined} aria-current={section === to ? 'page' : undefined}>
        {texte}
      </Link>
    )),
    // « À propos » (auteur, 2026-09-24) : l'auteur et son cabinet, sur hydroforge.fr, qui renvoie ici par son entrée
    // « Dataviz ». Le lien quitte le site : flèche ↗, comme sur hydroforge.fr.
    <a key="a-propos" href="https://hydroforge.fr/">
      À propos<span aria-hidden="true"> ↗</span>
    </a>,
  ]
  const page = (
    <BarriereErreur key={pathname}>
    <Suspense fallback={<Chargement reserve />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ma-commune" element={<MaCommune />} />
        <Route path="/france" element={<France />} />
        <Route path="/carte" element={<Carte />} />
        <Route path="/departement/:dd" element={<Departement />} />
        <Route path="/commune/:code" element={<Commune />} />
        <Route path="/commune/:code/analyses" element={<Analyses />} />
        <Route path="/commune/:code/detail" element={<Commune />} />
        <Route path="/reseau/:code" element={<Reseau />} />
        <Route path="/reseau/:code/detail" element={<Reseau />} />
        <Route path="/themes" element={<Themes />} />
        <Route path="/themes/plomb" element={<Plomb />} />
        <Route path="/themes/:slug" element={<Theme />} />
        <Route path="/services" element={<Services />} />
        <Route path="/service/:id" element={<Service />} />
        <Route path="/amont" element={<Amont />} />
        <Route path="/secheresse" element={<Secheresse />} />
        <Route path="/avis" element={<Avis />} />
        <Route path="/hors-grille" element={<HorsGrille />} />
        <Route path="/nappes" element={<Nappes />} />
        <Route path="/ressource" element={<Ressource />} />
        <Route path="/ressource-en-eau" element={<RessourceEnEau />} />
        <Route path="/methode" element={<Methode />} />
        <Route path="/mentions-legales" element={<Mentions />} />
        <Route path="/scene" element={<Scene />} />
        <Route path="/scene/:id" element={<Scene />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    </BarriereErreur>
  )
  return (
    <div className="layout" data-section={section ?? undefined}>
      <LienEvitement />
      <RetourEnHaut />
      <AnnonceDePage />
      <header className="topbar">
        <NavLink to="/" className="brand" viewTransition>
          Météo du robinet
        </NavLink>
        {/* Navigation par usage (refonte du 2026-09-22) : plus aucune page n'est atteignable seulement
            par la page Thèmes, et la barre ne mélange plus des sujets et des outils. `viewTransition`
            (transitions de page, 2026-09-22 soir) : la barre elle-même reste immobile pendant le
            changement (`view-transition-name: topbar`, styles.css) — seul le contenu en dessous transitionne. */}
        {rechercheEnTete && (
          <div className="entete-recherche">
            {/* Indication de la maquette du 05/10 ; les services d'eau, les réseaux et les codes restent cherchables. */}
            <Search />
          </div>
        )}
        <nav aria-label="Navigation principale">{liens}</nav>
        <span className="spacer" />
        {/* Partage de la page en cours, vue comprise (auteur, 24/09) : LinkedIn, Facebook, courriel, copie du lien. */}
        <Partage />
        {/* Choix du thème (revue ergonomie, 2026-09-23) : par défaut clair, même sans bouton, un système
            en sombre affichait le thème sombre sans échappatoire — « j'ai pas de thème clair ». */}
        <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'} title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="10" cy="10" r="4" />
              <path strokeLinecap="round" d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4M15.6 15.6l-1.4-1.4M5.8 5.8 4.4 4.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 11.5A7.5 7.5 0 0 1 8.5 3 7.5 7.5 0 1 0 17 11.5Z" />
            </svg>
          )}
        </button>
        <button type="button" className="menu-btn" ref={boutonMenu} aria-expanded={menu} aria-controls="menu-panneau" onClick={() => setMenu((m) => !m)}>
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d={menu ? 'M5 5l10 10M15 5 5 15' : 'M3 5.5h14M3 10h14M3 14.5h14'} />
          </svg>
          Menu
        </button>
        {/* Pas de bouton « Mode studio » : c'est l'outil de tournage de l'auteur (?studio=1, puis touche s). */}
        {menu && (
          <div
            className="menu-panneau"
            id="menu-panneau"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setMenu(false)
                boutonMenu.current?.focus()
              }
            }}
          >
            {rechercheEnTete && <Search />}
            <nav aria-label="Navigation principale">{liens}</nav>
          </div>
        )}
      </header>
      <main className="content" id="contenu" tabIndex={-1}>
        {studio ? (
          <div className="stage-wrap">
            <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
              {page}
            </div>
          </div>
        ) : (
          page
        )}
      </main>
      <footer className="footer">
        Données publiques françaises, retraitées par une chaîne de traitement documentée. <Link to="/methode" viewTransition>Méthode et sources</Link> · <Link to="/scene" viewTransition>Scènes vidéo</Link> · <Link to="/mentions-legales" viewTransition>Mentions légales</Link>
        <br />
        Contenus sous licence <a href={LICENCE.url} rel="license">{LICENCE.nom}</a>, à citer « {CITATION} » avec le lien de la page.{' '}
        <Link to="/mentions-legales#reutilisation" viewTransition>Réutilisation et citation</Link>
        <br />
        {CONCEPTION.texte}. <a href={CONCEPTION.url}>Découvrir le service</a>
      </footer>
      {studio && (
        <div className="studio-hint">
          mode studio · <b>s</b> pour quitter · paramètres d'URL : <code>?annee=2025</code> pour le millésime, <code>?studio=1</code> pour ouvrir en scène
        </div>
      )}
    </div>
  )
}

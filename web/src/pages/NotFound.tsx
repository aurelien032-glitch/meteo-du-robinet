import { Link } from 'react-router-dom'
import Search from '../components/Search'
import { usePageTitle } from '../lib/title'

/**
 * Route de secours (audit du 2026-09-22) : App.tsx n'avait pas de `path="*"`, donc une URL invalide
 * (favori périmé, faute de frappe, lien externe cassé) affichait l'en-tête et le pied de page autour
 * d'une zone de contenu vide, sans dire à l'utilisateur ce qui s'est passé.
 */
export default function NotFound() {
  usePageTitle('Page introuvable', "Cette adresse n'existe pas sur Météo du robinet. Cherchez votre commune ou repartez de la carte de France.")
  return (
    <div className="page">
      <h1>Page introuvable</h1>
      <p className="lead">Cette adresse ne correspond à aucune page de Météo du robinet — lien périmé ou mal recopié.</p>
      <Search autoFocus placeholder="Nom de la commune ou code INSEE…" />
      <p className="muted">
        Ou repartez de <Link to="/ma-commune">Ma commune</Link>, de la <Link to="/carte">carte de France</Link>, ou de{' '}
        <Link to="/">l'accueil</Link>.
      </p>
    </div>
  )
}

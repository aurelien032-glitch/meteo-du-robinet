/**
 * Adresses de partage d'une page (demande de l'auteur, 2026-09-24 ; choix : LinkedIn, Facebook, courriel et copie du
 * lien, sur toutes les pages) : de simples liens vers les pages de partage des réseaux, sans script tiers — rien ne
 * part vers un réseau tant que le visiteur ne clique pas. L'aperçu affiché vient des balises Open Graph des pages
 * (index.html, scripts/pages-statiques.mjs).
 */
export interface LienPartage {
  reseau: 'linkedin' | 'facebook' | 'courriel'
  label: string
  href: string
  /** Vrai pour un site tiers, ouvert dans un nouvel onglet : la vue en cours reste ouverte. */
  externe: boolean
}

export function liensPartage(url: string, titre: string): LienPartage[] {
  const u = encodeURIComponent(url)
  return [
    { reseau: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`, externe: true },
    { reseau: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, externe: true },
    { reseau: 'courriel', label: 'Courriel', href: `mailto:?subject=${encodeURIComponent(titre)}&body=${encodeURIComponent(`${titre}\n${url}`)}`, externe: false },
  ]
}

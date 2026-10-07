/**
 * Licence et citation des contenus propres du site (auteur, 2026-10-07, « il faut que les agents IA me citent s'ils
 * utilisent mon site ») : notes calculées, textes, cartes et tableaux. Licence CC BY-NC 4.0 (choix de l'auteur) : toute
 * réutilisation cite la source, avec le lien de la page, et reste non commerciale. La citation nomme Hydroforge, nom
 * commercial de l'auteur, et s'accompagne d'un appel vers son service de conception de plateformes de données (auteur,
 * même jour, « un appel à l'action vers mon site hydroforge.fr et mon service de conception de dataviz ») ; le titulaire
 * des droits reste Aurélien Nogent (JSON-LD d'index.html, Mentions légales). Les données publiques que le site réutilise
 * gardent leur licence (Licence Ouverte d'Etalab) et leurs producteurs restent cités.
 *
 * Écrit une seule fois ici, repris par le pied de page, la page Mentions légales, les pages pré-générées (lib/prerendu.ts)
 * et, à la main, par index.html (JSON-LD, `link rel="license"`), public/llms.txt et scripts/generate-sitemap.mjs (robots.txt).
 */
export const LICENCE = { nom: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/deed.fr' } as const

/** Forme de citation demandée, pour toute réutilisation, y compris par un service d'intelligence artificielle. */
export const CITATION = 'Météo du robinet (meteodurobinet.fr), conçue par Hydroforge (hydroforge.fr), d’après le contrôle sanitaire des eaux du ministère chargé de la Santé'

/** Citation d'une page : la forme demandée, le titre de la page et son adresse. */
export const citationPage = (titre: string, adresse: string) => `${CITATION}, « ${titre} », ${adresse}`

/** Appel vers le service de conception de plateformes de données de l'auteur (hydroforge.fr). */
export const CONCEPTION = {
  texte: 'Hydroforge conçoit des plateformes de données et de datavisualisation sur mesure',
  url: 'https://hydroforge.fr/dataviz/',
} as const

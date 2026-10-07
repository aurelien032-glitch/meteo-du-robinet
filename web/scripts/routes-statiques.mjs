// Pages principales de la Météo du robinet, servies en fichiers HTML (pages-statiques.mjs) et listées avec leur barre
// finale dans le plan du site (generate-sitemap.mjs). Titres et descriptions : ceux que chaque page se donne
// (usePageTitle), à tenir à jour avec elles ; les thèmes et les départements viennent des données publiées.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BASE = 'https://meteodurobinet.fr'

const PRINCIPALES = [
  { route: '/ma-commune', titre: 'Mon eau', description: "Recherche par commune : conformité de l'eau distribuée, situation des réseaux, avis de l'ARS, service d'eau et sécheresse." },
  { route: '/france', titre: 'L’eau du robinet en France', description: 'Note A, B, C ou D de chaque réseau d’eau potable, calculée par le site selon la méthode de l’indicateur de l’ARS, pour la France et par département.' },
  { route: '/carte', titre: 'Carte des départements', description: "Cartes de l'eau potable en France : qualité de l'eau du robinet, restrictions, services d'eau et ressource, par département et par commune." },
  { route: '/themes', titre: 'Sujets', description: 'Les sujets de l’eau du robinet : PFAS et TFA, pesticides, nitrates, bactéries, plomb et canalisations, avis de l’ARS, métaux et minéraux, radioactivité, substances sans limite de qualité.' },
  { route: '/services', titre: "Les services d'eau : prix, fuites, renouvellement", description: "Prix de l'eau, rendement des réseaux, renouvellement des canalisations et mode de gestion des services d'eau, département par département." },
  { route: '/amont', titre: "L'amont du robinet", description: "Prélèvements pour l'eau potable, ventes de pesticides, état des nappes et des rivières, département par département." },
  { route: '/secheresse', titre: 'Sécheresse : restrictions du jour', description: "Niveaux de restriction d'usage de l'eau en vigueur aujourd'hui, département par département." },
  { route: '/avis', titre: "Avis sanitaires de l'ARS", description: "Restrictions de consommation, consignes d'ébullition et eau déconseillée aux nourrissons et aux femmes enceintes, lues dans les conclusions du contrôle sanitaire." },
  { route: '/hors-grille', titre: 'Substances sans limite de qualité', description: 'Perchlorate, TFA, métabolites de pesticides et PFAS pris individuellement : étendue de la recherche et fréquence de quantification des substances analysées sans limite de qualité.' },
  { route: '/ressource-en-eau', titre: 'La ressource en eau', description: "D'où vient l'eau potable, l'état des nappes et les restrictions d'usage en période de sécheresse : sécheresse, nappes, prélèvements, services d'eau et amont du robinet." },
  { route: '/nappes', titre: 'Le niveau des nappes', description: 'Niveau des nappes phréatiques par rapport aux années passées, mois par mois et département par département.' },
  { route: '/ressource', titre: 'Pression sur la ressource', description: "Prélèvements d'eau potable, zones de déficit, fuites, consommation, protection des captages, nappes et restrictions, département par département." },
  { route: '/methode', titre: 'Méthode', description: 'Sources des données, règles de calcul et limites de lecture du site Météo du robinet.' },
  { route: '/mentions-legales', titre: 'Mentions légales', description: 'Éditeur, hébergeur, réutilisation des données publiques et données personnelles.' },
]

/**
 * Pages de sujets (refonte, lot 4) : titres et descriptions du site (lib/sujets.ts, PAGES_THEMES, vérifiés par
 * lib/sujets.test.ts), qui remplacent ceux de meta.themes ; « Plomb et canalisations » n'a pas de fichier de thème.
 */
export const PAGES_SUJETS = {
  pfas: { titre: 'PFAS et TFA', description: 'Somme de 20 PFAS et sa limite de qualité de 0,1 µg/L, réseau par réseau ; TFA, sans limite de qualité propre : recherche et quantifications.' },
  pesticides: { titre: 'Pesticides', description: 'Pesticides et métabolites dans l’eau du robinet : limites de qualité, réseaux non conformes selon la durée des dépassements, par département.' },
  nitrates: { titre: 'Nitrates', description: 'Nitrates dans l’eau du robinet : concentration maximale de l’année et limite de qualité de 50 mg/L, réseau par réseau et par département.' },
  bacteries: { titre: 'Bactéries', description: 'Bactériologie de l’eau du robinet : part des prélèvements non conformes et consignes de l’ARS, réseau par réseau et par département.' },
  metaux: { titre: 'Métaux et minéraux', description: 'Arsenic, fluorures, sélénium et autres métaux ou minéraux dans l’eau du robinet, comparés à leur limite de qualité, par département.' },
  radioactivite: { titre: 'Radioactivité', description: 'Radioactivité de l’eau du robinet : analyses comparées aux références de qualité de l’arrêté du 11 janvier 2007, par département.' },
  plomb: { titre: 'Plomb et canalisations', description: 'Plomb, cuivre et nickel mesurés au robinet : limites de qualité, analyses et résultats publiés, hors du jugement des réseaux.' },
}

/** Pages principales, thèmes et départements compris : { route, titre, description }. */
export function pagesPrincipales(ROOT) {
  const DATA = join(ROOT, 'public', 'data')
  const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf-8'))
  const departements = JSON.parse(readFileSync(join(DATA, 'geo', 'departements.json'), 'utf-8'))
  return [
    ...PRINCIPALES,
    ...meta.themes.map((t) => ({ route: `/themes/${t.slug}`, titre: PAGES_SUJETS[t.slug]?.titre ?? t.titre, description: PAGES_SUJETS[t.slug]?.description ?? t.question })),
    { route: '/themes/plomb', titre: PAGES_SUJETS.plomb.titre, description: PAGES_SUJETS.plomb.description },
    ...departements.features.map((f) => ({
      route: `/departement/${f.properties.code}`,
      titre: `${f.properties.nom} · eau du robinet`,
      description: `Qualité de l'eau du robinet dans le département ${f.properties.nom} (${f.properties.code}) : situation des réseaux, avis de l'ARS, services d'eau, amont.`,
    })),
  ]
}

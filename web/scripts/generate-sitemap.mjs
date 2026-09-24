// Génère public/sitemap.xml à partir des données publiées (public/data/), à chaque build (audit du
// 2026-09-22 : l'ancien sitemap.xml était un fichier statique écrit une fois, jamais régénéré — il ne
// contenait pas /ma-commune, ajoutée le jour même, et aurait continué à dériver du contenu réel à chaque
// millésime ou commune ajoutée. Le lancer une fois ne suffit pas ; il tourne maintenant avant `vite build`
// (voir le script "build" de package.json), donc plus jamais périmé sans qu'on y touche.
//
// Ce script corrige la fraîcheur du sitemap, pas le code HTTP des pages qu'il liste : GitHub Pages ne
// réécrit pas les routes d'une SPA, donc chaque URL /commune/*, /departement/* etc. répond 404 en accès
// direct (le JS s'auto-répare dans un vrai navigateur, pas dans un robot qui ne lit que le statut). Décision
// de l'auteur du 2026-09-22 : accepter cette limite pour l'instant plutôt que prérendre ou changer d'hébergeur.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')
const BASE = 'https://robinet.hydroforge.fr'

const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf-8'))
const communes = JSON.parse(readFileSync(join(DATA, 'communes.json'), 'utf-8'))
const departements = JSON.parse(readFileSync(join(DATA, 'geo', 'departements.json'), 'utf-8'))

const urls = [
  '/',
  '/ma-commune',
  '/carte',
  '/themes',
  ...meta.themes.map((t) => `/themes/${t.slug}`),
  '/services',
  '/amont',
  '/secheresse',
  '/avis',
  '/hors-grille',
  '/nappes',
  '/ressource',
  '/methode',
  '/mentions-legales',
  ...departements.features.map((f) => `/departement/${f.properties.code}`),
  ...communes.map((c) => `/commune/${c.c}`),
]

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${BASE}${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`

writeFileSync(join(ROOT, 'public', 'sitemap.xml'), xml, 'utf-8')
console.log(`sitemap.xml : ${urls.length} URLs`)

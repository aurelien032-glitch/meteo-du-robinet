// Génère le plan du site à partir des données publiées (public/data/), à chaque build (audit du 2026-09-22 : l'ancien
// sitemap.xml était un fichier statique écrit une fois, jamais régénéré — il ne contenait pas /ma-commune, ajoutée le
// jour même, et aurait continué à dériver du contenu réel à chaque millésime ou commune ajoutée). Il tourne avant
// `vite build` (script "build" de package.json), donc plus jamais périmé sans qu'on y touche.
//
// Toutes les adresses listées sont servies en fichiers, avec le statut 200 et leur barre finale, qui est aussi leur
// adresse canonique. Depuis le 29/09 (fiches réseau et service pré-générées), elles dépassent les 50 000 adresses
// qu'admet un plan du site : sitemap.xml est un index, qui renvoie à
//   - sitemap-pages.xml, écrit ici : accueil, pages principales, thèmes et départements (pages-statiques.mjs) ;
//   - sitemap-communes.xml, sitemap-reseaux.xml, sitemap-services.xml, écrits dans dist/ par
//     scripts/prerendu-fiches.ts avec les pages elles-mêmes : ils ne listent que des fiches publiées.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BASE, pagesPrincipales } from './routes-statiques.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

const pages = ['/', ...pagesPrincipales(ROOT).map((p) => `${p.route}/`)]
writeFileSync(
  join(PUBLIC, 'sitemap-pages.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((u) => `  <url><loc>${BASE}${u}</loc></url>`).join('\n') +
    `\n</urlset>\n`,
  'utf-8',
)

const plans = ['pages', 'communes', 'reseaux', 'services']
writeFileSync(
  join(PUBLIC, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    plans.map((p) => `  <sitemap><loc>${BASE}/sitemap-${p}.xml</loc></sitemap>`).join('\n') +
    `\n</sitemapindex>\n`,
  'utf-8',
)
console.log(`sitemap.xml : index de ${plans.length} plans ; sitemap-pages.xml : ${pages.length} URLs (les fiches : prerendu-fiches.ts)`)

// robots.txt, réécrit ici avec la même adresse (audit de visibilité du 24/09) : seul le pipeline l'écrivait
// (build.py, build_sitemap), avec l'adresse par défaut « VOTRE-COMPTE.github.io » jamais remplacée — le site
// publié indiquait aux moteurs un plan du site inexistant. En tête, la licence et la citation demandées (auteur,
// 2026-10-07, « il faut que les agents IA me citent s'ils utilisent mon site ») : les mêmes que src/lib/citation.ts.
writeFileSync(join(PUBLIC, 'robots.txt'), `# Contenus sous licence CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/deed.fr).
# Toute réutilisation, y compris par un service d'intelligence artificielle, cite « Météo du robinet
# (meteodurobinet.fr), conçue par Hydroforge (hydroforge.fr), d'après le contrôle sanitaire des eaux du ministère
# chargé de la Santé » avec le lien de la page, et reste non commerciale. Détails : ${BASE}/llms.txt
User-agent: *
Allow: /
Sitemap: ${BASE}/sitemap.xml
`, 'utf-8')
console.log(`robots.txt : plan du site ${BASE}/sitemap.xml`)

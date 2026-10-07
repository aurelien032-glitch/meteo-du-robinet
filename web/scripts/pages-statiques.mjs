// Après `vite build` (script postbuild) : une copie de dist/index.html par page principale, et 404.html.
//
// GitHub Pages ne réécrit pas les routes d'une application d'une seule page : toute adresse profonde était servie
// par 404.html, avec le statut 404, et les réseaux sociaux n'en tiraient aucun aperçu (demande de partage de
// l'auteur, 24/09 ; choix : « aperçu et pages principales »). Chaque page principale (routes-statiques.mjs) reçoit
// son dist/<route>/index.html, avec son titre, sa description et son adresse dans les balises d'aperçu ; GitHub
// Pages la sert avec le statut 200 et redirige /carte vers /carte/, paramètres compris (vérifié le 24/09). Chacune
// porte aussi son adresse canonique (relecture externe du 29/09) : barre finale, sans paramètre, pour que les
// moteurs de recherche ne tiennent pas /carte/?annee=2024 pour une autre page.
// Les fiches commune, réseau et service reçoivent leur fichier de scripts/prerendu-fiches.ts (lancé après celui-ci).
// Les autres adresses (analyses d'une commune, scènes, adresses inconnues) restent servies par 404.html : aperçu
// générique, sans og:url, pour qu'un réseau social garde l'adresse partagée plutôt que celle de l'accueil.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE, pagesPrincipales } from './routes-statiques.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const modele = readFileSync(join(DIST, 'index.html'), 'utf-8')

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Remplace une balise du modèle ; échoue bruyamment si elle manque (index.html modifié sans ce script). */
function remplacer(html, motif, valeur, nom) {
  if (!motif.test(html)) throw new Error(`pages-statiques : balise ${nom} introuvable dans dist/index.html`)
  return html.replace(motif, valeur)
}

const OG_URL = /<meta property="og:url" content="[^"]*"\s*\/?>\s*/

function page({ route, titre, description }) {
  const t = attr(`${titre} · Météo du robinet`)
  const d = attr(description)
  let h = modele
  h = remplacer(h, /<title>[^<]*<\/title>/, `<title>${t}</title>`, 'title')
  h = remplacer(h, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`, 'description')
  h = remplacer(h, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`, 'og:title')
  h = remplacer(h, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`, 'og:description')
  const u = attr(`${BASE}${route}/`)
  h = remplacer(h, OG_URL, `<meta property="og:url" content="${u}" />\n    `, 'og:url')
  h = remplacer(h, /<\/head>/, `  <link rel="canonical" href="${u}" />\n  </head>`, '</head>')
  return h
}

writeFileSync(join(DIST, '404.html'), remplacer(modele, OG_URL, '', 'og:url'), 'utf-8')
// L'accueil garde les balises du modèle et reçoit son adresse canonique (prerendu.ts la remplace sur chaque fiche). Son
// texte pour les robots (refonte, lot 2, 05/10 : titre, bilan, sujets, ressource, méthode) est posé dans #root par
// scripts/prerendu-fiches.ts, après les fiches, avec les textes de la page (lib/accueil.ts) : jamais recopiés ici.
writeFileSync(join(DIST, 'index.html'), remplacer(modele, /<\/head>/, `  <link rel="canonical" href="${BASE}/" />\n  </head>`, '</head>'), 'utf-8')

const pages = pagesPrincipales(ROOT)
for (const p of pages) {
  const dossier = join(DIST, ...p.route.slice(1).split('/'))
  mkdirSync(dossier, { recursive: true })
  writeFileSync(join(dossier, 'index.html'), page(p), 'utf-8')
}
console.log(`pages statiques : ${pages.length} pages principales, l'accueil et 404.html`)

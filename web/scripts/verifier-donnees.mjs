// Garde du build : les fichiers de données que la refonte lit et que git ne versionne pas (web/public/data est
// produit par le pipeline) doivent exister, sinon le site publié perdrait sa recherche ou la carte de l'accueil
// sans que rien ne le signale. Usage : node scripts/verifier-donnees.mjs (appelé par `npm run build`).
import { existsSync, readFileSync } from 'node:fs'

const ATTENDUS = [
  ['recherche/communes.json', 'robinet recherche'],
  ['recherche/services.json', 'robinet recherche'],
  ['recherche/reseaux.json', 'robinet recherche'],
  ['recherche/departements.json', 'robinet recherche'],
  ['geo/departements-svg.json', 'robinet geo'],
  ['situations/depts.json', 'robinet build'],
]

const manquants = ATTENDUS.filter(([f]) => !existsSync(`public/data/${f}`))
if (manquants.length) {
  console.error('Données manquantes dans web/public/data (produites par le pipeline, non versionnées) :')
  for (const [f, cmd] of manquants) console.error(` - ${f} : lancer \`uv run ${cmd}\` depuis pipeline/`)
  process.exit(1)
}

// Colonnes attendues de l'index (pipeline/robinet/recherche.py) : un index d'un format antérieur, en lignes, ferait
// planter la recherche au premier caractère tapé.
const COLONNES = {
  'recherche/communes.json': ['c', 'n', 'p'],
  'recherche/services.json': ['i', 'n', 'e', 'd', 'p', 'm'],
  'recherche/reseaux.json': ['c', 'n', 'k'],
}
const anciens = Object.entries(COLONNES).filter(([f, cles]) => {
  const x = JSON.parse(readFileSync(`public/data/${f}`, 'utf-8'))
  return Array.isArray(x) || cles.some((k) => !Array.isArray(x[k]))
})
if (anciens.length) {
  console.error(`Index de recherche d'un format antérieur : ${anciens.map(([f]) => f).join(', ')}. Lancer \`uv run robinet recherche\` depuis pipeline/.`)
  process.exit(1)
}

// Délégations sans information (24/09) : sans `sans_information`, les pages d'avis écriraient « aucun avis » là où les
// conclusions de l'ARS ne parlent jamais de consigne (Isère, Savoie…), l'erreur que ce format corrige.
const avis = JSON.parse(readFileSync('public/data/avis/national.json', 'utf-8'))
if (!avis.sans_information || !avis.lecture) {
  console.error("avis/national.json d'un format antérieur (sans lecture ni sans_information). Lancer `uv run robinet avis` depuis pipeline/.")
  process.exit(1)
}
console.log(`Données de la refonte présentes (${ATTENDUS.length} fichiers), index de recherche et avis au format attendu.`)

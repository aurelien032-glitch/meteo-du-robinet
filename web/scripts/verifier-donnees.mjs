// Garde du build : les fichiers de données que la refonte lit et que git ne versionne pas (web/public/data est
// produit par le pipeline) doivent exister, sinon le site publié perdrait sa recherche ou la carte de l'accueil
// sans que rien ne le signale. Usage : node scripts/verifier-donnees.mjs (appelé par `npm run build`).
import { existsSync, readdirSync, readFileSync } from 'node:fs'

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
// planter la recherche au premier caractère tapé ; un index des communes sans « z » (codes postaux, 05/10) ferait
// ouvrir à « 02100 » la commune dont c'est le code INSEE au lieu de celles de ce code postal.
const COLONNES = {
  'recherche/communes.json': ['c', 'n', 'p', 'z'],
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
// Période et suite des avis de l'année en cours (25/09) : sans `arret` ni `derniers`, le bandeau et le bulletin ne diraient
// ni la date d'arrêt des données, ni si le dernier prélèvement connu d'un réseau reprend encore un avis.
const avisSansSuite = readdirSync('public/data/avis').filter((f) => {
  const x = f === 'national.json' ? avis : JSON.parse(readFileSync(`public/data/avis/${f}`, 'utf-8'))
  return !x.arret || (f !== 'national.json' && !x.derniers)
})
if (avisSansSuite.length) {
  const autres = avisSansSuite.length > 5 ? ` et ${avisSansSuite.length - 5} autres` : ''
  console.error(`avis/ d'un format antérieur (sans arret ni derniers) : ${avisSansSuite.slice(0, 5).join(', ')}${autres}. Lancer \`uv run robinet avis\` depuis pipeline/.`)
  process.exit(1)
}
const sispea = JSON.parse(readFileSync('public/data/sispea/national.json', 'utf-8'))
// Années SISPEA (25/09) : `robinet sispea` réécrit ce fichier avec les seules années reçues ; avec les quatre millésimes
// du contrôle sanitaire, /services perdait 2020-2022 et son historique un morceau (2008-2019 viennent de l'API Hub'Eau).
// Exigées : de 2020 (SISPEA_YEARS de pipeline/robinet/config.py) à la plus récente présente, et au moins jusqu'à 2022.
const PREMIERE_SISPEA = 2020
const presentesSispea = new Set(Object.keys(sispea.annees).map(Number))
const derniereSispea = Math.max(2022, ...presentesSispea)
const perduesSispea = []
for (let a = PREMIERE_SISPEA; a <= derniereSispea; a++) if (!presentesSispea.has(a)) perduesSispea.push(a)
if (perduesSispea.length) {
  console.error(`sispea/national.json sans ${perduesSispea.join(', ')} : \`robinet sispea\` n'a reçu qu'une partie des années. Relancer \`uv run robinet sispea\` depuis pipeline/, sans -y (toutes les années, de ${PREMIERE_SISPEA} à l'année en cours).`)
  process.exit(1)
}
// Vue communale des services d'eau sur /carte (24/09) : un fichier par année SISPEA proposée (au moins 3 000 services
// déclarant un prix, SEUIL_DECLARANTS de lib/sispea.ts), en colonnes. Sans lui, la carte des communes resterait vide.
const COLONNES_SISPEA = ['nom', 'entite', 'mode', 'prix', 'rend', 'renouv', 'protection', 'conso', 'pertes']
const anneesSispea = Object.keys(sispea.annees).filter((a) => sispea.annees[a].prix.n >= 3000)
const sispeaAbsents = anneesSispea.filter((a) => {
  const f = `public/data/sispea/communes/${a}.json`
  return !existsSync(f) || COLONNES_SISPEA.some((c) => !JSON.parse(readFileSync(f, 'utf-8')).colonnes?.includes(c))
})
if (sispeaAbsents.length) {
  console.error(`sispea/communes/<année>.json absent ou d'un format antérieur pour ${sispeaAbsents.join(', ')}. Lancer \`uv run robinet sispea\` depuis pipeline/.`)
  process.exit(1)
}
// Références de qualité des thèmes (24/09) : sans « res_ref », le thème de la radioactivité retomberait à zéro réseau.
const radio = JSON.parse(readFileSync('public/data/themes/radioactivite.json', 'utf-8'))
if (Object.values(radio.national).some((v) => !('res_ref' in v))) {
  console.error("themes/radioactivite.json d'un format antérieur (sans res_ref). Lancer `uv run robinet build` depuis pipeline/.")
  process.exit(1)
}
// Fuites sur les volumes déclarés, un seul chiffre sur tout le site (24/09) : sans elles, /services afficherait « – ».
const sansPertes = anneesSispea.filter((a) => !('pertes_vol' in sispea.annees[a]))
if (sansPertes.length) {
  console.error(`sispea/national.json sans « pertes_vol » pour ${sansPertes.join(', ')}. Lancer \`uv run robinet sispea\` depuis pipeline/.`)
  process.exit(1)
}
// Séries mensuelles des réseaux, un dossier par millésime du contrôle sanitaire (03/10) : sans lui, les fiches
// perdraient leurs graphiques « mois par mois » sans erreur visible.
const millesimes = JSON.parse(readFileSync('public/data/meta.json', 'utf-8')).annees ?? []
const sansSeries = millesimes.filter((a) => !existsSync(`public/data/series/reseaux/${a}`))
if (sansSeries.length || existsSync('public/data/series/dept')) {
  console.error(`Séries mensuelles des réseaux absentes pour ${sansSeries.join(', ') || '—'} ou d'un format antérieur (series/dept). Lancer \`uv run robinet build\` depuis pipeline/.`)
  process.exit(1)
}
console.log(
  `Données de la refonte présentes (${ATTENDUS.length} fichiers, et la vue communale des services d'eau pour ${anneesSispea.join(', ')}), SISPEA de ${PREMIERE_SISPEA} à ${derniereSispea}, index de recherche et avis au format attendu.`,
)

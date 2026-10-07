// Signalements d'erreur du site en tickets privés (.github/workflows/signalements.yml, choix de l'auteur du 2026-10-07).
//
// Lit le CSV publié des réponses du formulaire Google (colonnes : horodatage, puis les trois questions, page, année et
// message, dans l'ordre du formulaire), et crée un ticket « signalement » par réponse nouvelle dans le dépôt DEPOT. Une
// réponse est reconnue par une empreinte de son horodatage et de son message, écrite dans le ticket : une réponse déjà
// transformée en ticket, ouvert ou fermé, ne l'est jamais deux fois. Garde-fous contre les envois de robots : messages
// de moins de 10 caractères écartés, plus de 5 liens écartés, 20 tickets au plus par exécution.
//
// Usage : GITHUB_TOKEN=… DEPOT=propriétaire/dépôt SIGNALEMENTS_CSV=https://… node web/scripts/signalements.mjs
//         node web/scripts/signalements.mjs --essai fichier.csv   (lecture d'un CSV local, sans rien créer)
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const MAX_PAR_EXECUTION = 20
const ETIQUETTE = 'signalement'

/** Lecture d'un CSV (guillemets doublés, retours à la ligne dans un champ). */
export function lireCsv(texte) {
  const lignes = []
  let champ = ''
  let ligne = []
  let entre = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entre) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') entre = false
      else champ += c
    } else if (c === '"') entre = true
    else if (c === ',') {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else champ += c
  }
  if (champ || ligne.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return lignes.filter((l) => l.some((x) => x.trim()))
}

/** Réponses du formulaire : horodatage, page, année, message ; empreinte de chacune. */
export function reponses(lignes) {
  return lignes.slice(1).map(([horodatage = '', page = '', annee = '', message = '']) => ({
    horodatage: horodatage.trim(),
    page: page.trim(),
    annee: annee.trim(),
    message: message.trim(),
    empreinte: createHash('sha256').update(`${horodatage.trim()}\n${message.trim()}`).digest('hex').slice(0, 16),
  }))
}

/** Une réponse plausible : un message d'au moins 10 caractères, pas plus de 5 liens. */
export const plausible = (r) => r.message.length >= 10 && (r.message.match(/https?:\/\//g) ?? []).length <= 5

/** Titre et corps du ticket. */
export function ticket(r) {
  let chemin = r.page
  try {
    chemin = new URL(r.page).pathname
  } catch {
    /* adresse illisible : gardée telle quelle */
  }
  const citation = r.message.slice(0, 3000).split('\n').map((l) => `> ${l}`).join('\n')
  return {
    title: `Signalement : ${chemin || 'page non précisée'}`.slice(0, 120),
    body: [
      `Page : ${r.page || 'non précisée'}`,
      `Année affichée : ${r.annee || 'non précisée'}`,
      `Reçu le : ${r.horodatage}`,
      '',
      citation,
      '',
      `<!-- signalement:${r.empreinte} -->`,
    ].join('\n'),
    labels: [ETIQUETTE],
  }
}

async function github(chemin, options = {}) {
  const r = await fetch(`https://api.github.com/repos/${process.env.DEPOT}${chemin}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  })
  if (!r.ok) throw new Error(`GitHub ${options.method ?? 'GET'} ${chemin} : HTTP ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

/** Empreintes déjà présentes dans les tickets « signalement », ouverts ou fermés. */
async function empreintesConnues() {
  const vues = new Set()
  for (let page = 1; page < 50; page++) {
    const lot = await github(`/issues?labels=${ETIQUETTE}&state=all&per_page=100&page=${page}`)
    for (const t of lot) for (const m of (t.body ?? '').matchAll(/<!-- signalement:([0-9a-f]{16}) -->/g)) vues.add(m[1])
    if (lot.length < 100) break
  }
  return vues
}

async function principal() {
  const essai = process.argv.indexOf('--essai')
  if (essai > 0) {
    const rs = reponses(lireCsv(readFileSync(process.argv[essai + 1], 'utf-8')))
    for (const r of rs) console.log(plausible(r) ? 'retenu ' : 'écarté ', JSON.stringify(ticket(r).title), r.empreinte)
    return
  }
  for (const v of ['GITHUB_TOKEN', 'DEPOT', 'SIGNALEMENTS_CSV']) if (!process.env[v]) throw new Error(`variable ${v} absente`)
  const r = await fetch(process.env.SIGNALEMENTS_CSV, { redirect: 'follow' })
  if (!r.ok) throw new Error(`CSV des réponses : HTTP ${r.status}`)
  const toutes = reponses(lireCsv(await r.text()))
  const connues = await empreintesConnues()
  const nouvelles = toutes.filter((x) => !connues.has(x.empreinte) && plausible(x))
  for (const x of nouvelles.slice(0, MAX_PAR_EXECUTION)) {
    const t = await github('/issues', { method: 'POST', body: JSON.stringify(ticket(x)) })
    console.log(`ticket #${t.number} : ${t.title}`)
  }
  console.log(`${toutes.length} réponses, ${nouvelles.length} nouvelles, ${Math.min(nouvelles.length, MAX_PAR_EXECUTION)} tickets créés`)
}

// Exécuté directement (et non importé) : la tâche ou l'essai local.
if (process.argv[1]?.endsWith('signalements.mjs')) {
  principal().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}

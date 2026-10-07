// Publication de dist/ sur la branche gh-pages du dépôt public, en un seul commit sans historique (comme
// `gh-pages --no-history`). gh-pages nommait chacun des quelque 70 000 fichiers déjà publiés dans une seule commande
// `git rm`, que Windows refuse (spawn ENAMETOOLONG, 2026-10-06) ; ici, git lit lui-même l'arborescence (`add -A`).
// Le dépôt de travail est temporaire et hors de dist/ ; les fins de ligne ne sont pas converties (octets identiques).
// Dépôt cible : variable DEPOT (le workflow y met l'adresse munie du jeton), sinon l'adresse publique. Auteur et message :
// AUTEUR_NOM, AUTEUR_COURRIEL et MESSAGE (workflow), sinon la configuration git du poste et le commit source.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DIST = resolve(import.meta.dirname, '..', 'dist')
const DEPOT = process.env.DEPOT || 'https://github.com/aurelien032-glitch/meteo-du-robinet.git'
const BRANCHE = 'gh-pages'

for (const f of ['index.html', 'CNAME', '.nojekyll']) {
  if (!existsSync(join(DIST, f))) throw new Error(`dist/${f} manque : lancer npm run build avant de publier.`)
}

const gitDir = mkdtempSync(join(tmpdir(), 'publication-'))
const git = (...args) =>
  // gc.auto=0 : sans lui, git compacte de lui-même les quelque 140 000 objets après le commit, plusieurs minutes perdues
  // (l'envoi les compacte de toute façon).
  execFileSync('git', ['--git-dir', gitDir, '--work-tree', DIST, '-c', 'core.autocrlf=false', '-c', 'core.longpaths=true', '-c', 'gc.auto=0', ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
    maxBuffer: 1 << 26,
  })
const lire = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

try {
  const source = lire('rev-parse', '--short', 'HEAD') || 'source inconnue'
  const nom = process.env.AUTEUR_NOM || lire('config', 'user.name') || 'Météo du robinet'
  const courriel = process.env.AUTEUR_COURRIEL || lire('config', 'user.email') || 'robinet-bot@users.noreply.github.com'
  const message = process.env.MESSAGE || `Publication de ${source}`
  git('init', '-q', '-b', BRANCHE)
  console.log('Ajout des fichiers de dist/…')
  git('add', '-A')
  git('-c', `user.name=${nom}`, '-c', `user.email=${courriel}`, 'commit', '-q', '-m', message)
  console.log(`Envoi vers ${DEPOT.replace(/\/\/[^@/]*@/, '//')} (${BRANCHE})…`)
  git('push', '-f', DEPOT, `${BRANCHE}:${BRANCHE}`)
  console.log('Publié.')
} finally {
  rmSync(gitDir, { recursive: true, force: true })
}

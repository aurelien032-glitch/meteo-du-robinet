// Revue visuelle : capture chaque page du site en bureau, mobile, sombre, couleurs forcées et studio dans
// web/exports/review/, et audite l'accessibilité (axe-core, WCAG 2.2 AA) des passes claire, mobile et sombre.
// Usage : node scripts/review-pages.mjs [http://localhost:5173] ; AXE_CORE=<chemin d'axe.min.js> pour un autre axe.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const base = process.argv[2] ?? 'http://localhost:5173'
const out = 'exports/review'
mkdirSync(out, { recursive: true })

// axe-core est une devDependency ; absent (installation antérieure à son ajout), l'audit est sauté et le dit.
const axe = (() => {
  try {
    return readFileSync(process.env.AXE_CORE ?? createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf-8')
  } catch {
    return null
  }
})()
const REGLES_AXE = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
// Réponses attendues de VigiEau, que la fiche commune traite (lib/vigieau.ts) : 404 sans zone, 409 quand la commune
// relève de plusieurs zones. Chrome les journalise comme des erreurs ; toute autre erreur console fait échouer la revue.
const attendue = (m) => /status of 40[49]/.test(m.text()) && (m.location()?.url ?? '').startsWith('https://api.vigieau.gouv.fr/')
let audits = 0

const pages = [
  ['home', '/'],
  ['carte', '/carte'],
  // Isère : délégation de l'ARS sans information sur les consignes (24/09), communes en gris, classement expliqué.
  ['carte-avis-isere', '/carte?indic=avis&dept=38'],
  ['departement', '/departement/35'],
  // Cas de la maquette du 23/09 : conforme avec réserve, sept réseaux et restriction PFAS, consigne d'ébullition.
  ['commune', '/commune/35238'],
  ['commune-cherbourg', '/commune/50129'],
  ['commune-fonsorbes', '/commune/31187'],
  ['analyses', '/commune/35238/analyses'],
  ['reseau', '/reseau/035004230'],
  ['reseau-asselinerie', '/reseau/050000645'],
  ['themes', '/themes'],
  ['theme-pesticides', '/themes/pesticides'],
  ['services', '/services'],
  ['service', '/service/77654'],
  ['amont', '/amont'],
  ['secheresse', '/secheresse'],
  ['avis', '/avis'],
  ['hors-grille', '/hors-grille'],
  ['nappes', '/nappes'],
  ['ressource', '/ressource'],
  ['methode', '/methode'],
  ['scenes', '/scene'],
]

const browser = await chromium.launch()
const errors = []
// Sombre par le réglage du système, comme la plupart des visiteurs qui n'ont rien choisi ; couleurs forcées
// (contraste élevé de Windows), où seules les formes et les textes distinguent les états.
// Le dernier élément dit si la passe est auditée : en couleurs forcées, les contrastes sont ceux du système.
const passes = [
  [1280, 800, 'desktop', {}, true],
  [375, 812, 'mobile', {}, true],
  [1280, 800, 'sombre', { colorScheme: 'dark' }, true],
  [1280, 800, 'couleurs-forcees', { forcedColors: 'active' }, false],
]
for (const [w, h, tag, emulation, auditee] of passes) {
  // Mouvement réduit : sinon la révélation au défilement laisse invisibles, dans une capture pleine page,
  // tous les blocs sous la ligne de flottaison (étude UX du 23/09).
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce', ...emulation })
  // Aucun thème mémorisé : chaque passe voit le réglage du système qu'elle émule.
  await ctx.addInitScript(() => {
    try {
      localStorage.removeItem('theme')
    } catch {
      /* stockage indisponible */
    }
  })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !attendue(m)) errors.push(`${tag} ${page.url()} : ${m.text().slice(0, 160)}`) })
  page.on('pageerror', (e) => errors.push(`${tag} ${page.url()} : ${String(e).slice(0, 160)}`))
  for (const [name, path] of pages) {
    await page.goto(base + path, { waitUntil: 'load' })
    await page.waitForTimeout(name === 'analyses' ? 20000 : 3000) // Hub'Eau en direct : plusieurs requêtes
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 2) errors.push(`${tag} ${path} : débordement horizontal de ${overflow}px`)
    if (auditee && axe) {
      // Injecté par evaluate plutôt que par une balise <script> : une CSP future ne le bloquerait pas.
      await page.evaluate(axe)
      const violations = await page.evaluate(async (regles) => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: regles } })
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, cible: v.nodes[0]?.target.join(' ') }))
      }, REGLES_AXE)
      for (const v of violations) errors.push(`${tag} ${path} : axe ${v.id} (${v.impact}, ${v.n} élément${v.n > 1 ? 's' : ''}, ex. ${v.cible})`)
      audits++
    }
  }
  await ctx.close()
}
// Studio 1920×1080 : une scène et la page carte.
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await ctx.newPage()
for (const [name, path] of [['scene-pesticides', '/scene/pesticides-effacement?studio=1'], ['scene-prix', '/scene/prix-fuites?studio=1'], ['carte', '/carte?studio=1']]) {
  await page.goto(base + path, { waitUntil: 'load' })
  await page.waitForTimeout(7000) // MapLibre et les encarts ont besoin de quelques secondes en 1920×1080
  await page.screenshot({ path: `${out}/studio-${name}.png` })
}
await browser.close()
console.log(`${pages.length} pages × ${passes.length} + 3 studio → ${out}/`)
console.log(axe ? `axe-core : ${audits} audits WCAG 2.2 AA (clair, mobile, sombre)` : 'axe-core absent (npm install) : audit d’accessibilité sauté')
if (errors.length) {
  console.log('Problèmes :')
  for (const e of errors) console.log(' - ' + e)
  process.exitCode = 1 // la revue échoue si une page a une erreur console ou un débordement
}

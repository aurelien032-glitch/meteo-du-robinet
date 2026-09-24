// Exporte chaque scène vidéo en PNG 1920×1080 avec un vrai Chromium.
// Prérequis : `npm run dev` lancé (ou SCENE_BASE pointant vers le site publié) et `npx playwright install chromium` une fois.
// Usage : npm run scenes:export             → exports/<scene>.png
//         ANNEE=2024 SCALE=2 npm run scenes:export   → millésime 2024, rendu 3840×2160
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const ids = require('../src/scenes/ids.json')
const base = (process.env.SCENE_BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const annee = process.env.ANNEE ? `&annee=${process.env.ANNEE}` : ''
const scale = Number(process.env.SCALE ?? 1)
const out = process.env.OUT ?? 'exports'

await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale })
for (const id of ids) {
  const url = `${base}/scene/${id}?studio=1${annee}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-scene]', { timeout: 30000 })
  await page.waitForTimeout(3000) // animations ECharts et chargement des tuiles
  const file = `${out}/${id}.png`
  await page.screenshot({ path: file })
  console.log(`✓ ${file}`)
}
await browser.close()

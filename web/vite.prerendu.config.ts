import { defineConfig } from 'vite'

// Compilation du script des fiches pré-générées (communes, réseaux, services) (scripts/prerendu-fiches.ts) pour Node : les modules du site
// tels quels, sans recopier public/ (400 Mo de données) dans le dossier de sortie. `npm run prerendu`.
export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: 'scripts/prerendu-fiches.ts',
    outDir: '.prerendu',
    emptyOutDir: true,
    copyPublicDir: false,
  },
})

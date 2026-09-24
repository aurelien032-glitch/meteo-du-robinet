import { defineConfig } from 'vitest/config'

export default defineConfig({
  // styles.css est lue telle quelle par lib/jetons.test.ts (garde-fous des jetons de couleur) : sans cette
  // inclusion, Vitest remplace tout fichier CSS par une chaîne vide, même importé avec « ?raw ».
  test: { environment: 'node', include: ['src/**/*.test.ts'], css: { include: [/styles\.css/] } },
})

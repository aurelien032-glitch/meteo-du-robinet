/**
 * Version datée de la méthode et historique des changements qui modifient les notes A à D ou leur lecture (auteur,
 * 2026-10-07, plutôt qu'un bandeau « bêta » : la méthode évolue, et la page Méthode le dit avec ses dates). À tenir à
 * jour à chaque changement d'une règle de jugement (lib/situations.ts, pipeline/robinet/situations.py, themes.py) : une
 * entrée en tête, et `VERSION_METHODE` à sa date. Les notes affichées sont recalculées pour toutes les années.
 */
export interface ChangementMethode {
  /** date ISO du changement publié */
  date: string
  texte: string
}

export const HISTORIQUE_METHODE: readonly ChangementMethode[] = [
  {
    date: '2026-10-07',
    texte:
      'Avis de l’ARS : restrictions de consommation et consignes d’ébullition comptées à part. Cartes des parts de réseaux aux couleurs des notes, en quatre paliers (10, 25 et 50 %).',
  },
  {
    date: '2026-10-05',
    texte:
      'Bactériologie notée selon la grille publiée par l’ARS, sur les derniers prélèvements. PFAS : un dépassement compte lorsqu’il est observé au moins deux jours dans l’année. Métabolites non pertinents écartés de la note selon l’Anses (ESA-métolachlore et diméthénamide ESA depuis 2022, AMPA depuis 2025), total des pesticides compris. Comparaison à 198 synthèses de l’ARS de 2025 : accord de 84 % sur la note.',
  },
  {
    date: '2026-10-04',
    texte:
      'Matériaux des canalisations et réactifs de traitement écartés de la note. Limites de la directive 2020/2184 appliquées depuis 2023. Sixième famille, les autres limites de qualité.',
  },
  {
    date: '2026-10-03',
    texte: 'Note A à D de chaque réseau, calculée selon l’indicateur annuel de l’ARS.',
  },
]

/** Date de la version en cours : celle du changement le plus récent. */
export const VERSION_METHODE = HISTORIQUE_METHODE[0].date

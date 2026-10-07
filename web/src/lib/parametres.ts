/**
 * Libellés lisibles des paramètres les plus courants (choix de l'auteur, 24/09) : le contrôle sanitaire les écrit
 * comme au laboratoire (« Escherichia coli /100ml - MF », « Turbidité néphélométrique NFU »). Codes SANDRE vérifiés
 * dans params.json ; les autres paramètres gardent leur libellé officiel.
 */
const LISIBLES: Record<string, string> = {
  '1449': 'E. coli (bactérie d’origine fécale)',
  '6455': 'Entérocoques (bactéries d’origine fécale)',
  '1447': 'Bactéries coliformes',
  '5440': 'Bactéries revivifiables à 22 °C',
  '5441': 'Bactéries revivifiables à 36 °C',
  '1042': 'Spores de bactéries sulfito-réductrices',
  '1295': 'Turbidité (eau trouble)',
  '1303': 'Conductivité (minéralisation de l’eau)',
  '1340': 'Nitrates',
  '1335': 'Ammonium',
  '1370': 'Aluminium',
  '1393': 'Fer',
  '1394': 'Manganèse',
  '1754': 'Dioxyde de chlore',
  '5900': 'Couleur',
  '5901': 'Odeur',
  '5902': 'Saveur',
}

/** Libellé affiché d'un paramètre : sa forme lisible si elle existe, sinon le libellé officiel, sinon son code. */
export function libelleParametre(code: string, officiel?: string | null): string {
  return LISIBLES[code] ?? officiel ?? `Paramètre ${code}`
}

/**
 * Charnière « de » d'un nom de département, selon son type de nom en clair (TNCC) au code officiel géographique de
 * l'INSEE : « de l’Isère », « du Rhône », « de la Savoie », « des Hauts-de-Seine », « d’Ille-et-Vilaine », « de Paris »,
 * « de La Réunion ». Les prépositions de lieu (« en Isère » ou « dans l’Isère », « dans l’Ain ») suivent l'usage et non une
 * règle : les phrases du site qui nomment un département passent par cette charnière.
 */
const GROUPES: [string, string[]][] = [
  ['de l’', ['01', '02', '03', '07', '09', '10', '11', '12', '27', '34', '36', '38', '60', '61', '89', '91']],
  ['du ', ['14', '15', '18', '25', '29', '30', '32', '39', '41', '45', '46', '47', '56', '59', '62', '63', '67', '68', '69', '81', '82', '83', '84', '90', '94', '95']],
  [
    'de la ',
    ['16', '17', '19', '2A', '2B', '21', '23', '24', '26', '31', '33', '42', '43', '44', '48', '50', '51', '52', '53', '55', '57', '58', '70', '72', '73', '74', '76', '80', '85', '86', '87', '93', '971', '972', '973'],
  ],
  ['des ', ['04', '05', '06', '08', '13', '22', '40', '64', '65', '66', '78', '79', '88', '92']],
  ['de ', ['49', '54', '71', '75', '77', '974', '976']],
  ['d’', ['28', '35', '37']],
]
export const CHARNIERES: Readonly<Record<string, string>> = Object.fromEntries(GROUPES.flatMap(([c, codes]) => codes.map((code) => [code, c])))

/** « de l’Isère » pour (« 38 », « Isère ») ; un code inconnu donne « du département … ». */
export function deDepartement(code: string, nom: string): string {
  const c = CHARNIERES[code]
  return c ? `${c}${nom}` : `du département ${nom}`
}

/** « de l’Ain », « de l’Ain et de l’Isère », « de l’Ain, du Rhône et de l’Isère ». */
export function deDepartements(codes: readonly string[], nom: (code: string) => string): string {
  const x = codes.map((c) => deDepartement(c, nom(c)))
  return x.length > 1 ? `${x.slice(0, -1).join(', ')} et ${x[x.length - 1]}` : (x[0] ?? '')
}

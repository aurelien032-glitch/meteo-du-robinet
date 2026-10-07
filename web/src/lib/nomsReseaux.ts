/**
 * Noms lisibles des réseaux de distribution (refonte des fiches, lot 1, 2026-10-05). Le contrôle sanitaire les écrit
 * en capitales, souvent préfixés d'« UDI » et liés par des soulignés (« UDI SAINT QUENTIN HAUT SERVICE »,
 * « CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES ») : la fiche les remet en casse de titre française, sans rien
 * inventer (ni accent, ni mot) ; seul le nom de la commune, quand il ouvre le nom d'un de ses réseaux, est repris sous
 * sa forme officielle. Le code du réseau reste écrit au détail.
 */

/** Mots de liaison laissés en minuscules hors de la tête du nom. */
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'sous', 'en', 'à', 'au', 'aux'])

/**
 * Noms communs fréquents des réseaux, en minuscules hors de la tête du nom (« Haut service », « Saint Jurs village »),
 * comme un nom propre suivi de sa précision.
 */
const COMMUNS = new Set(['service', 'reseau', 'village', 'bourg', 'ville', 'centre', 'zone', 'industrielle', 'secteur', 'quartier', 'distribution', 'commune'])

/** Sigles connus des collectivités et des zones, gardés en capitales. */
const SIGLES = new Set([
  'UDI', 'AEP', 'CA', 'CC', 'CU', 'CEBR', 'HBA', 'SIAEP', 'SIAE', 'SIEA', 'SIE', 'SIEP', 'SIVOM', 'SIVU', 'SMAEP', 'SMEP', 'SIDEN', 'SDEA',
  'SAUR', 'SEDIF', 'ZA', 'ZI', 'ZAC', 'ZUP', 'UV', 'TM', 'GBM', 'CHU',
])

/** Abréviations de « saint » : sans voyelle, elles ne sont pas des sigles. */
const SAINTS: Record<string, string> = { ST: 'SAINT', STE: 'SAINTE', STS: 'SAINTS', STES: 'SAINTES' }

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '')

/** Sigle : connu, fait de capitales sans voyelle (« GBM », « CC2VV »), ou mêlant chiffres et lettres. */
function estSigle(mot: string): boolean {
  const m = sansAccent(mot).toUpperCase().replace(/[.,;:]+$/, '')
  if (SIGLES.has(m)) return true
  if (SAINTS[m]) return false
  if (/\d/.test(m) && /[A-Z]/.test(m)) return true
  return m.length >= 2 && /^[A-Z]+$/.test(m) && !/[AEIOUY]/.test(m)
}

/** Initiale en capitale, le reste en minuscules ; « l'Eyral », « d'Echillais » ; une apostrophe interne reste (« Tourc'h »). */
function capitale(mot: string, tete: boolean): string {
  if (!mot) return mot
  const bas = mot.toLowerCase()
  const elision = /^([dl])['’](.+)$/.exec(bas)
  if (elision) return `${tete ? elision[1].toUpperCase() : elision[1]}'${capitale(elision[2], true)}`
  if (!tete && (PETITS.has(bas) || COMMUNS.has(sansAccent(bas)))) return bas
  return bas.charAt(0).toUpperCase() + bas.slice(1)
}

/** Un mot du nom, découpé à ses traits d'union, barres obliques et parenthèses, chaque morceau mis en casse. */
function casseMot(mot: string, tete: boolean): string {
  let premier = tete
  return mot
    .split(/([-/()+])/)
    .map((m) => {
      if (m === '' || /^[-/()+]$/.test(m)) {
        // Après une barre oblique, une parenthèse ouvrante ou un « + », un nouveau nom commence.
        if (m === '/' || m === '(' || m === '+') premier = true
        return m
      }
      const out = estSigle(m) ? m.toUpperCase() : capitale(m, premier)
      premier = false
      return out
    })
    .join('')
}

/** Casse de titre française d'un nom en capitales. */
export function casseTitre(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m, i) => casseMot(m, i === 0))
    .join(' ')
}

/** Forme de comparaison : sans accent, en capitales, « ST » lu « SAINT », sans séparateur. */
function cle(s: string): string {
  return sansAccent(s)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((m) => SAINTS[m] ?? m)
    .join('')
}

/** Reste significatif : au moins un mot de trois lettres qui n'est pas un mot de liaison. */
const significatif = (reste: string) => reste.split(/[\s\-/()]+/).some((m) => /\p{L}{3,}/u.test(m) && !PETITS.has(m.toLowerCase()))

/**
 * Nom brut nettoyé : sans « UDI » en tête ni la préposition qui la suit (« UDI DE CHOUY », « UDI D'ABBECOURT » donnent
 * « Chouy », « Abbecourt » ; liste des réseaux de l'Aisne, 2026-10-05), soulignés remplacés par une espace, espaces
 * réduites. La préposition reste quand rien de significatif ne la suit.
 */
function nettoyer(nom: string): string {
  const brut = nom.replace(/_/g, ' ')
  const sansUdi = brut.replace(/^\s*UDI\b[\s:-]*/i, '')
  const sansPrep = sansUdi !== brut ? sansUdi.replace(/^(?:(?:DE|DU|DES)\s+|D['’]\s*)(?=\S)/i, '') : sansUdi
  return (significatif(sansPrep) ? sansPrep : sansUdi).replace(/\s+/g, ' ').trim()
}

/**
 * Nom lisible complet d'un réseau, pour son titre : quand le nom s'ouvre sur l'une des `communes` données, cette tête
 * prend la forme officielle du nom de la commune et le reste suit (« UDI SAINT QUENTIN BAS SERVICE » → « Saint-Quentin
 * Bas service » ; « UDI ST QUENTIN-HARLY » → « Saint-Quentin – Harly ») ; sinon le nom lisible seul. Rien n'est inventé.
 */
export function nomCompletReseau(nom: string | null | undefined, communes: readonly string[]): string {
  const lisible = nomLisibleReseau(nom)
  for (const c of communes) {
    const court = nomLisibleReseau(nom, c)
    if (court === c || court.startsWith(`${c} `)) return court
    if (court !== lisible) return `${c} ${court}`
  }
  return lisible
}

/**
 * Nom lisible d'un réseau. `nomCommune` : nom officiel de la commune, donné quand elle a plusieurs réseaux. S'il ouvre
 * le nom du réseau, il est retiré quand un reste significatif subsiste (« UDI SAINT QUENTIN HAUT SERVICE » →
 * « Haut service ») ; quand la commune est liée au reste par un trait d'union (« UDI ST QUENTIN-HARLY »), le nom
 * désigne deux lieux et devient « Saint-Quentin – Harly » ; sans reste, le nom de la commune. Un nom vide reste vide.
 */
export function nomLisibleReseau(nom: string | null | undefined, nomCommune?: string | null): string {
  const brut = nettoyer(nom ?? '')
  if (!brut) return (nom ?? '').trim()
  if (nomCommune) {
    const cible = cle(nomCommune)
    // Mots du nom avec le séparateur qui les suit : on cherche la plus courte tête égale au nom de la commune.
    const morceaux = brut.split(/([\s-]+)/)
    let tete = ''
    for (let i = 0; i < morceaux.length; i += 2) {
      tete += morceaux[i]
      if (cle(tete) === cible) {
        const sep = morceaux[i + 1] ?? ''
        const reste = morceaux.slice(i + 2).join('').trim()
        if (!reste) return nomCommune
        if (sep.includes('-')) return `${nomCommune} – ${casseTitre(reste)}`
        if (significatif(reste)) return casseTitre(reste)
        return `${nomCommune} ${casseTitre(reste)}`
      }
      if (cle(tete).length >= cible.length) break
      tete += morceaux[i + 1] ?? ''
    }
  }
  return casseTitre(brut)
}

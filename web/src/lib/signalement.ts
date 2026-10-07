/**
 * Signalement d'une erreur sur une page (auteur, 2026-10-07 : « il ne faut pas afficher github, simplement est-ce qu'on peut
 * transmettre les signalements sur mon github du projet en privé ? », puis « message seul ») : le formulaire du site envoie
 * le message, l'adresse de la page et l'année affichée à un formulaire Google qui sert de boîte de dépôt ; la tâche
 * `.github/workflows/signalements.yml` du dépôt privé en fait, chaque heure, un ticket « signalement »
 * (scripts/signalements.mjs). Aucune donnée personnelle n'est demandée ; ni Google ni GitHub ne sont nommés sur la page,
 * les Mentions légales les citent. Mise en place du formulaire Google : docs/signalements.md.
 *
 * Tant que `FORMULAIRE.action` est vide, la ligne « Signaler une erreur sur cette page » n'est pas affichée.
 */
export const FORMULAIRE = {
  /** https://docs.google.com/forms/d/e/<identifiant>/formResponse */
  action: 'https://docs.google.com/forms/d/e/1FAIpQLScYuuvLLUgeE5A1bIdQ5qXB8nIF7THUq7ZlrFAaI7D6IgwJlg/formResponse',
  /** identifiants des trois questions du formulaire Google (« entry.123456789 ») */
  champs: { page: 'entry.810773099', annee: 'entry.2116576373', message: 'entry.1346235467' },
} as const

/** Le formulaire Google est renseigné : la ligne de signalement peut s'afficher. */
export const signalementActif = (): boolean => Boolean(FORMULAIRE.action && FORMULAIRE.champs.page && FORMULAIRE.champs.message)

/** Longueurs admises d'un message : assez pour dire quelque chose, pas un texte entier. */
export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 2000

/** Corps de l'envoi au formulaire Google, au format qu'il attend. */
export function corpsSignalement(o: { page: string; annee: string; message: string }): URLSearchParams {
  const corps = new URLSearchParams()
  corps.set(FORMULAIRE.champs.page, o.page)
  if (FORMULAIRE.champs.annee) corps.set(FORMULAIRE.champs.annee, o.annee)
  corps.set(FORMULAIRE.champs.message, o.message.trim().slice(0, MESSAGE_MAX))
  return corps
}

/**
 * Envoi au formulaire Google. Sa réponse n'est pas lisible depuis un autre site (mode « no-cors ») : l'envoi est tenu
 * pour réussi quand la requête aboutit, et en échec quand le réseau la refuse.
 */
export async function envoyerSignalement(o: { page: string; annee: string; message: string }): Promise<void> {
  await fetch(FORMULAIRE.action, { method: 'POST', mode: 'no-cors', body: corpsSignalement(o) })
}

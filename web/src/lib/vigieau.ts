import { useEffect, useState } from 'react'

/** Réponse de https://api.vigieau.gouv.fr/api/zones?commune=<INSEE>&profil=particulier (extrait). */
export interface ZoneVigiEau {
  id: number
  nom: string
  type: 'SUP' | 'SOU' | 'AEP' | string
  niveauGravite?: string | null
  arrete?: { dateDebutValidite?: string | null; dateFinValidite?: string | null; cheminFichier?: string | null } | null
  usages?: { nom: string; description?: string | null; thematique?: string | null }[]
}

/** Niveaux de restriction, dans l'ordre : l'indice est celui des paliers de la bande ressource. */
export const NIVEAUX_SECHERESSE = ['Aucune', 'Vigilance', 'Alerte', 'Alerte renforcée', 'Crise'] as const
/**
 * Ton de chaque niveau (règle « juger et alerter en couleur », auteur, 24/09) : une restriction sécheresse est une
 * alerte officielle, dans la palette de la carte (07/10, `jetonsEtats`) — pas de restriction en bleu clair, vigilance
 * en jaune, alerte en orange, alerte renforcée en rouge, crise en rouge très sombre. Elle restreint des usages de
 * l'eau, pas sa consommation : le libellé le dit toujours à côté de la couleur.
 */
export const TONS_SECHERESSE = ['good', 'warn', 'warn', 'bad', 'bad'] as const
const RANG: Record<string, number> = { vigilance: 1, alerte: 2, alerte_renforcee: 3, crise: 4 }
/** Clés VigiEau des niveaux, dans l'ordre de NIVEAUX_SECHERESSE. */
export const CLES_SECHERESSE = ['pas_de_restriction', 'vigilance', 'alerte', 'alerte_renforcee', 'crise'] as const
/** Rang d'une clé de niveau VigiEau (0 : pas de restriction, clé absente ou inconnue). */
export const rangNiveau = (cle: string | null | undefined) => RANG[cle ?? ''] ?? 0
export const TYPES_ZONE: Record<string, string> = { SUP: 'eaux superficielles', SOU: 'eaux souterraines', AEP: 'eau potable' }

/** Rang d'une zone (0 : aucune restriction ou niveau inconnu). */
export const rangZone = (z: ZoneVigiEau) => RANG[z.niveauGravite ?? ''] ?? 0

/** Zones sous restriction et la plus sévère ; niveau 0 sans restriction en vigueur. */
export function secheresseCommune(zones: readonly ZoneVigiEau[]): { niveau: number; actives: ZoneVigiEau[]; pire: ZoneVigiEau | null } {
  const actives = zones.filter((z) => rangZone(z) > 0)
  const pire = actives.reduce<ZoneVigiEau | null>((acc, z) => (!acc || rangZone(z) > rangZone(acc) ? z : acc), null)
  return { niveau: pire ? rangZone(pire) : 0, actives, pire }
}

/**
 * Restrictions en vigueur, interrogées en direct chez VigiEau (API publique, CORS ouvert) : rien n'est mis en cache
 * par le pipeline, l'information change au jour le jour. Une réponse par commune et par visite, partagée entre la
 * bande ressource et le détail ; un échec n'est pas gardé, la visite suivante réessaie.
 */
const cache = new Map<string, Promise<ZoneVigiEau[]>>()
export function chargerVigiEau(insee: string): Promise<ZoneVigiEau[]> {
  let p = cache.get(insee)
  if (!p) {
    p = fetch(`https://api.vigieau.gouv.fr/api/zones?commune=${insee}&profil=particulier`).then(async (r) => {
      if (r.status === 404) return []
      // 409 : VigiEau ne sait pas à quelle zone rattacher la commune (plusieurs zones, comme à Bordeaux).
      // Ce n'est pas une panne : l'interface renvoie alors vers la carte nationale plutôt qu'une erreur.
      if (r.status === 409) throw new Error('plusieurs zones')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return (await r.json()) as ZoneVigiEau[]
    })
    p.catch(() => cache.delete(insee))
    cache.set(insee, p)
  }
  return p
}

/** Réponse de https://api.vigieau.gouv.fr/api/departements (extrait) : niveau le plus élevé de chaque département. */
export interface VigiDept {
  code: string
  nom: string
  niveauGraviteMax: string | null
  niveauGraviteSupMax: string | null
  niveauGraviteSouMax: string | null
  niveauGraviteAepMax: string | null
}

// Mémorisé au niveau module : la carte, la page Sécheresse et l'accueil appellent chacun useVigiEauDepartements() sur
// le même rendu, sans ce cache ils interrogeraient l'API plusieurs fois et pourraient afficher des états différents le
// temps que les requêtes répondent. Un échec n'est pas gardé en cache, pour être retenté au montage suivant.
let departements: Promise<VigiDept[]> | null = null
function chargerDepartements(): Promise<VigiDept[]> {
  if (!departements) {
    const p = fetch('https://api.vigieau.gouv.fr/api/departements').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    p.catch(() => {
      departements = null
    })
    departements = p
  }
  return departements
}

/** Niveaux du jour de tous les départements, interrogés en direct chez VigiEau. */
export function useVigiEauDepartements(): { depts: VigiDept[] | null; error: string | null } {
  const [depts, setDepts] = useState<VigiDept[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    chargerDepartements().then((d) => alive && setDepts(d), (e) => alive && setError(String(e)))
    return () => {
      alive = false
    }
  }, [])
  return { depts, error }
}

export function useVigiEau(insee: string): { zones: ZoneVigiEau[] | null; erreur: string | null } {
  const [etat, setEtat] = useState<{ insee: string; zones: ZoneVigiEau[] | null; erreur: string | null } | null>(null)
  useEffect(() => {
    let vivant = true
    chargerVigiEau(insee).then(
      (zones) => vivant && setEtat({ insee, zones, erreur: null }),
      (e) => vivant && setEtat({ insee, zones: null, erreur: String(e) }),
    )
    return () => {
      vivant = false
    }
  }, [insee])
  return etat?.insee === insee ? { zones: etat.zones, erreur: etat.erreur } : { zones: null, erreur: null }
}

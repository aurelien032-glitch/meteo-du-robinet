import { communeDeRattachement, deptOfInsee, type SispeaCommunesFile } from './types'

/**
 * Vue communale des indicateurs des services d'eau sur /carte (demande de l'auteur, 2026-09-24) : chaque commune prend
 * la valeur du service qui la dessert, lue dans sispea/communes/<année>.json (pipeline/robinet/build_sispea.py). Une
 * commune desservie par plusieurs services prend celui qui publie le prix, le même que sa fiche (sispea/dept).
 * L'unité reste le service : la liste qui accompagne la carte d'un département est celle de ses services, jamais un
 * compte de communes.
 */

/** Colonne lue par un indicateur ; « mode » vaut 0 en régie, 1 en délégation. */
export type ColService = 'prix' | 'rend' | 'renouv' | 'mode' | 'protection' | 'conso' | 'pertes'

export interface ServiceCarte {
  /** identifiant SISPEA (fiche /service/:id) */
  id: string
  /** collectivité, à défaut entité de gestion */
  nom: string
  /** entité de gestion, quand elle distingue les services d'une même collectivité (« 01-Rennes-St Jacques ») */
  entite: string | null
  mode: 'régie' | 'délégation' | null
}

export interface LigneService {
  service: ServiceCarte
  v: number
  /** communes du département que le service dessert */
  communes: number
}

export interface LectureServices {
  /** Service qui dessert la commune cette année-là ; null si la commune est absente de l'observatoire. */
  service: (insee: string) => ServiceCarte | null
  /** Valeur de l'indicateur pour la commune : celle de son service. */
  valeur: (insee: string, col: ColService) => number | null
  /**
   * Services qui desservent des communes du département : ceux qui ont une valeur, rangés comme le classement
   * départemental (`pire` « bas » : du plus faible au plus fort, sinon du plus fort au plus faible), puis du plus
   * grand territoire au plus petit ; `sansValeur` compte les autres.
   */
  servicesDuDepartement: (dept: string, col: ColService, pire: 'haut' | 'bas' | null) => { lignes: LigneService[]; sansValeur: number }
}

export function lireServices(f: SispeaCommunesFile): LectureServices {
  const col = (c: string) => f.colonnes.indexOf(c)
  const [iNom, iEntite, iMode] = [col('nom'), col('entite'), col('mode')]
  const texte = (x: string | number | null | undefined) => (typeof x === 'string' && x.trim() ? x : null)
  const cache = new Map<string, ServiceCarte | null>()
  const service = (id: string): ServiceCarte | null => {
    if (!cache.has(id)) {
      const s = f.services[id]
      cache.set(
        id,
        s ? { id, nom: texte(s[iNom]) ?? 'Service non nommé', entite: texte(s[iEntite]), mode: s[iMode] === 'r' ? 'régie' : s[iMode] === 'd' ? 'délégation' : null } : null,
      )
    }
    return cache.get(id)!
  }
  const valeurService = (id: string, c: ColService): number | null => {
    const s = f.services[id]
    if (!s) return null
    if (c === 'mode') return s[iMode] === 'd' ? 1 : s[iMode] === 'r' ? 0 : null
    const v = s[col(c)]
    return typeof v === 'number' ? v : null
  }
  // Un arrondissement de Paris, Marseille ou Lyon prend le service de sa commune : la SISPEA ne connaît qu'elle.
  const idDe = (insee: string): string | undefined => f.communes[communeDeRattachement(insee)]
  return {
    service: (insee) => {
      const id = idDe(insee)
      return id ? service(id) : null
    },
    valeur: (insee, c) => {
      const id = idDe(insee)
      return id ? valeurService(id, c) : null
    },
    servicesDuDepartement: (dept, c, pire) => {
      const nb = new Map<string, number>()
      for (const [insee, id] of Object.entries(f.communes)) if (deptOfInsee(insee) === dept) nb.set(id, (nb.get(id) ?? 0) + 1)
      const lignes: LigneService[] = []
      let sansValeur = 0
      for (const [id, communes] of nb) {
        const v = valeurService(id, c)
        const s = service(id)
        if (v == null || !s) sansValeur++
        else lignes.push({ service: s, v, communes })
      }
      const sens = pire === 'bas' ? 1 : -1
      lignes.sort((a, b) => sens * (a.v - b.v) || b.communes - a.communes || a.service.nom.localeCompare(b.service.nom, 'fr'))
      return { lignes, sansValeur }
    },
  }
}

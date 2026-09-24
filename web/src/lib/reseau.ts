import { serviceDeCommune, type ServiceCommune } from './sispea'
import type { DeptFile, SispeaDeptFile } from './types'

/**
 * Fiche réseau (maquette du 23/09, « Où arrive cette eau ? ») : ce que le réseau dessert l'année choisie. Un réseau
 * et ses communes sont décrits dans le même fichier départemental (vérifié sur les 48 154 liens du 23/09).
 */

/** Communes desservies par le réseau l'année `annee` : celles qui le comptent parmi leurs réseaux cette année-là. */
export function communesDuReseau(f: DeptFile, code: string, annee: string): string[] {
  return (f.reseaux[code]?.communes ?? []).filter((c) => f.communes[c]?.reseaux[annee]?.includes(code))
}

/**
 * Services d'eau de ces communes, chacun une fois, d'après leur dernière déclaration SISPEA (serviceDeCommune) ; par
 * nom, puis par entité : les cinq services de la CEBR portent le même nom de collectivité. Un réseau peut desservir
 * les communes de plusieurs services, et la fiche le dit.
 */
export function servicesDesCommunes(f: SispeaDeptFile | null | undefined, communes: readonly string[]): ServiceCommune[] {
  const vus = new Map<string, ServiceCommune>()
  for (const c of communes) {
    const s = serviceDeCommune(f, c)
    if (s) vus.set(s.id ?? s.nom, s)
  }
  return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || (a.entite ?? '').localeCompare(b.entite ?? '', 'fr'))
}

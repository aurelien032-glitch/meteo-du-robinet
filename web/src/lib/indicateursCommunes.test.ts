import { describe, expect, it } from 'vitest'
import { etatCommune, infoBulleCommune, INDICS_COMMUNES, niveauxCommune, valeurCommune, type IndicCommuneKey } from './indicateursCommunes'
import { INDICS } from './indicateursCarte'
import type { MapFile, MapRow } from './types'

const ind = (k: IndicCommuneKey) => INDICS_COMMUNES.find((i) => i.key === k)!

/** Ligne de carte : prélèvements, avis de l'ARS (MapRow[14]) et code des situations (un chiffre par famille). */
function ligne(plv: number, avis: number | null | undefined, code?: string): MapRow {
  const r: MapRow = [plv, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, null, null, 1]
  if (avis !== undefined || code !== undefined) r[14] = avis
  if (code !== undefined) r[15] = code
  return r
}

describe('table des indicateurs communaux', () => {
  it('mêmes clés et mêmes libellés sur /carte et la fiche département', () => {
    expect(INDICS_COMMUNES.map((i) => i.key)).toEqual(['pesticides', 'azote', 'pfas', 'microbio', 'metaux', 'autres', 'any', 'restrictions', 'avis'])
    for (const i of INDICS_COMMUNES) {
      const c = INDICS.find((x) => x.key === i.key)!
      expect([c.label, c.kind, c.fam, c.descCommune, c.theme]).toEqual([i.label, i.kind, i.fam, i.descCommune, i.theme])
    }
  })
  it('une famille par indicateur de situation, aucune pour les restrictions et les avis', () => {
    for (const i of INDICS_COMMUNES) expect(i.fam != null).toBe(i.kind === 'situation')
    expect(ind('any').fam).toBe('toutes')
  })
  it('légende des avis : les libellés entiers des avis de l’ARS', () => {
    expect(niveauxCommune(ind('avis'))).toEqual(['aucun avis', 'déconseillée aux publics sensibles', "consigne d'ébullition", 'restriction de consommation'])
    expect(niveauxCommune(ind('restrictions'))).toEqual(['ni restriction ni consigne', 'restriction ou consigne'])
    expect(niveauxCommune(ind('pesticides'))).toBeUndefined()
  })
})

describe('valeur et état d’une commune', () => {
  it('sans prélèvement : aucune valeur', () => {
    expect(valeurCommune(ind('pesticides'), undefined)).toBeNull()
    expect(valeurCommune(ind('avis'), ligne(0, 2, '000000'))).toBeNull()
  })
  it('situation : la classe de la famille dans le code de la commune', () => {
    const r = ligne(12, 0, '021000')
    expect(valeurCommune(ind('pesticides'), r)).toBe(0)
    expect(valeurCommune(ind('azote'), r)).toBe(2)
    expect(valeurCommune(ind('pfas'), r)).toBe(1)
    expect(valeurCommune(ind('autres'), ligne(12, 0, '00000-'))).toBeNull()
    expect(etatCommune(ind('autres'), ligne(12, 0, '00000-'), 2025)).toBe('famille non analysée')
  })
  it('restriction : 1 sous restriction ou consigne, avec les familles en cause ; pas d’information sans conclusion', () => {
    const restreinte = ligne(5, 3, '300000')
    expect(valeurCommune(ind('restrictions'), restreinte)).toBe(1)
    expect(etatCommune(ind('restrictions'), restreinte, 2025)).toBe('restriction ou consigne (pesticides)')
    expect(valeurCommune(ind('restrictions'), ligne(5, 0, '000000'))).toBe(0)
    expect(etatCommune(ind('restrictions'), ligne(5, 0, '000000'), 2025)).toBe('ni restriction ni consigne')
    expect(valeurCommune(ind('restrictions'), ligne(5, null, '000000'))).toBeNull()
    expect(etatCommune(ind('restrictions'), ligne(5, null, '000000'), 2025)).toBe("pas d'information")
    expect(etatCommune(ind('restrictions'), ligne(5, 0), 2025)).toBe('aucune famille analysée')
  })
  it('avis : le niveau le plus grave, « aucun avis » dans un fichier antérieur, « pas d’information » à null', () => {
    expect(valeurCommune(ind('avis'), ligne(5, 2, '000000'))).toBe(2)
    expect(etatCommune(ind('avis'), ligne(5, 2, '000000'), 2025)).toBe("consigne d'ébullition")
    expect(valeurCommune(ind('avis'), ligne(5, undefined))).toBe(0)
    expect(valeurCommune(ind('avis'), ligne(5, null, '000000'))).toBeNull()
    expect(etatCommune(ind('avis'), ligne(5, null, '000000'), 2025)).toBe("pas d'information")
  })
})

describe('info-bulle d’une commune', () => {
  const map: MapFile = { '75056': ligne(1234, 0, '000000'), '01001': ligne(0, 0) }
  const noms = new Map([['75056', 'Paris'], ['01001', "L'Abergement-Clémenciat"]])
  const etat = () => 'conforme'
  it('un arrondissement prend les chiffres de sa commune, et le dit', () => {
    expect(infoBulleCommune({ code: '75112', nom: 'Paris 12e Arrondissement' }, map, noms, 2025, etat)).toBe(
      `<b>Paris 12e Arrondissement</b> · ensemble de Paris<br>conforme · ${(1234).toLocaleString('fr-FR')} prélèvements`,
    )
  })
  it('sans prélèvement dans l’année', () => {
    expect(infoBulleCommune({ code: '01001' }, map, noms, 2025, etat)).toBe("<b>L'Abergement-Clémenciat</b><br>pas de prélèvement en 2025")
  })
})

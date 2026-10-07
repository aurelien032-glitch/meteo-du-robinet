import { describe, expect, it } from 'vitest'
import { casseTitre, nomLisibleReseau } from './nomsReseaux'

// Noms réels du contrôle sanitaire (web/public/data/dept/*.json, champ `nom` des réseaux, 2026-10-05).
describe('noms lisibles des réseaux', () => {
  it.each([
    ['UDI SAINT QUENTIN HAUT SERVICE', 'Saint Quentin Haut service'],
    ['CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', 'CEBR Villejean/Rophemel/Mezieres/Ava Rennes'],
    ['CEBR_PLESSIS BEUCHER_ACIGNE', 'CEBR Plessis Beucher Acigne'],
    ['AMBRONAY', 'Ambronay'],
    ['HBA NURIEUX-VOLOGNAT VOLOGNAT PEYRIAT', 'HBA Nurieux-Volognat Volognat Peyriat'],
    ['FRESNOY LE GRAND', 'Fresnoy le Grand'],
    ['RESEAU AINAY-LE-CHATEAU', 'Reseau Ainay-le-Chateau'],
    ['ALLEMAGNE EN PROVENCE VILLAGE', 'Allemagne en Provence village'],
    ['ENSEMBLE DE LA COMMUNE ASPRES-LES-CORPS', 'Ensemble de la commune Aspres-les-Corps'],
    ['CHEF LIEU LE SAUZE+PORT ST PIERRE', 'Chef Lieu le Sauze+Port St Pierre'],
    ['ARCENS UDI LANTEYRON', 'Arcens UDI Lanteyron'],
    ["ST PIERREVILLE CROS DE L'EYRAL", "St Pierreville Cros de l'Eyral"],
    ['LA CHAPELLE ST LUC ZONE INDUSTRIELLE', 'La Chapelle St Luc zone industrielle'],
    ['MERIAL UV', 'Merial UV'],
    ["R. D'ECHILLAIS", "R. d'Echillais"],
    ['DIJON METROPOLE, CHENOVE, R. PPAL-ZUP', 'Dijon Metropole, Chenove, R. Ppal-ZUP'],
    ['CC2VV ABBENANS', 'CC2VV Abbenans'],
    ['GBM SAINT VIT', 'GBM Saint Vit'],
    ['SOLAURE ', 'Solaure'],
    ['TREGLONOU (BAS-LEON)', 'Treglonou (Bas-Leon)'],
    ["TOURC'H (BRON)", "Tourc'h (Bron)"],
    ['CC. CLE - BRIGNAC', 'CC. Cle - Brignac'],
    ['TM PRODUCTION TOULOUSE', 'TM Production Toulouse'],
    ['STE LUCIE-PIEDIVALLE-AGHIO', 'Ste Lucie-Piedivalle-Aghio'],
  ])('%s → %s', (brut, lisible) => {
    expect(nomLisibleReseau(brut)).toBe(lisible)
  })

  it('la préposition qui suit « UDI » est retirée (liste des réseaux de l’Aisne, 2026-10-05)', () => {
    expect(nomLisibleReseau('UDI DE CHOUY')).toBe('Chouy')
    expect(nomLisibleReseau("UDI D'ABBECOURT")).toBe('Abbecourt')
    expect(nomLisibleReseau("UDI DE LA VALLEE DE L'OISEL")).toBe("La Vallee de l'Oisel")
    expect(nomLisibleReseau('DE CHOUY')).toBe('De Chouy')
  })
  it('une commune à plusieurs réseaux : son nom retiré en tête quand un reste significatif subsiste', () => {
    expect(nomLisibleReseau('UDI SAINT QUENTIN HAUT SERVICE', 'Saint-Quentin')).toBe('Haut service')
    expect(nomLisibleReseau('UDI SAINT QUENTIN BAS SERVICE', 'Saint-Quentin')).toBe('Bas service')
  })
  it('commune liée au reste par un trait d’union : deux lieux, la commune sous son nom officiel', () => {
    expect(nomLisibleReseau('UDI ST QUENTIN-HARLY', 'Saint-Quentin')).toBe('Saint-Quentin – Harly')
  })
  it('reste non significatif ou absent : la commune garde son nom officiel', () => {
    expect(nomLisibleReseau('SAINT QUENTIN 2', 'Saint-Quentin')).toBe('Saint-Quentin 2')
    expect(nomLisibleReseau('UDI SAINT-QUENTIN', 'Saint-Quentin')).toBe('Saint-Quentin')
  })
  it('un nom qui ne commence pas par la commune reste entier', () => {
    expect(nomLisibleReseau('CEBR_VILLEJEAN/ROPHEMEL/MEZIERES/AVA_RENNES', 'Rennes')).toBe('CEBR Villejean/Rophemel/Mezieres/Ava Rennes')
    expect(nomLisibleReseau('TOURLAVILLE EST', 'Cherbourg-en-Cotentin')).toBe('Tourlaville Est')
  })
  it('jamais de nom inventé : vide reste vide, aucun accent ajouté', () => {
    expect(nomLisibleReseau('')).toBe('')
    expect(nomLisibleReseau(null)).toBe('')
    expect(casseTitre('MEZIERES')).toBe('Mezieres')
  })
})

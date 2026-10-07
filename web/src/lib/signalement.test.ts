import { describe, expect, it } from 'vitest'
import { FORMULAIRE, MESSAGE_MAX, signalementActif } from './signalement'

describe('signalement d’une erreur (07/10)', () => {
  it('reste masqué tant que le formulaire Google n’est pas renseigné', () => {
    expect(signalementActif()).toBe(Boolean(FORMULAIRE.action && FORMULAIRE.champs.page && FORMULAIRE.champs.message))
  })
  it('vise un formulaire Google, et accepte un message de longueur raisonnable', () => {
    if (FORMULAIRE.action) expect(FORMULAIRE.action).toMatch(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/)
    for (const c of Object.values(FORMULAIRE.champs)) if (c) expect(c).toMatch(/^entry\.\d+$/)
    expect(MESSAGE_MAX).toBeGreaterThanOrEqual(500)
  })
})

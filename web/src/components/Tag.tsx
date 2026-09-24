import type { ReactNode } from 'react'
import type { Ton } from '../lib/situations'
import Voyant from './Voyant'

/**
 * Étiquette d'état : voyant et libellé sur le fond teinté du ton (avis de l'ARS, statut d'un réseau). Sans ton
 * (avis limité à un bâtiment), étiquette neutre, sans voyant.
 */
export default function Tag({ ton, children }: { ton: Ton | null; children: ReactNode }) {
  return (
    <span className={`tag tone-${ton ?? 'neutre'}`}>
      {ton && <Voyant ton={ton} taille={14} />}
      {children}
    </span>
  )
}

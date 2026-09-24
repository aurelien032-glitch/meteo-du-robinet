import { Link } from 'react-router-dom'
import Tag from './Tag'
import Voyant from './Voyant'
import { avisDuReseau, avisEnCours, toneAvis } from '../lib/avis'
import { fmt } from '../lib/data'
import { useJson } from '../lib/hooks'
import { AVIS_LIBELLE, type AvisDeptFile } from '../lib/types'

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Bandeau en tête de fiche commune (étude UX du 23/09, décision de l'auteur) : un avis de l'ARS de l'année
 * en cours, quel que soit le millésime affiché. Sans lui, une fiche réglée sur la dernière année complète
 * disait « aucun avis » alors qu'une restriction figurait dans l'année en cours (703 communes au 18/09/2026).
 * Il précède la barre d'année, dont il ne dépend pas, et porte sa date (maquette du 23/09) ; teinté du ton de
 * l'avis le plus grave. Avis limités à un bâtiment exclus ; rien quand l'année affichée est déjà l'année en
 * cours, le bulletin donnant alors le détail. Fiche commune (`insee`) ou fiche réseau (`reseau` : ses avis, réunis
 * depuis les communes qu'il dessert).
 */
export default function AvisEnCours({
  insee,
  reseau,
  dept,
  annee,
  anneeEnCours,
}: {
  insee?: string
  reseau?: string
  dept: string
  annee: string | undefined
  anneeEnCours: string | undefined
}) {
  const file = useJson<AvisDeptFile>(`avis/${dept}.json`)
  if (!anneeEnCours || annee === anneeEnCours || file.error || !file.data) return null
  const lignes = reseau ? avisDuReseau(file.data.communes, reseau) : (file.data.communes[insee ?? ''] ?? [])
  const a = avisEnCours(lignes, file.data.textes, anneeEnCours)
  if (!a) return null
  const ton = toneAvis(a.pire)
  // Le cadre porte la gouttière de la page (`.page > *`) ; le bandeau, sa propre boîte teintée, s'aligne sur le texte.
  return (
    <div className="cadre">
      <section className={`bandeau-avis tone-${ton}`} aria-label="Avis de l’ARS de l’année en cours">
        <Voyant ton={ton} taille={28} />
        <p className="bandeau-avis-titre">
          <span>Avis de l’ARS en {anneeEnCours}, année en cours</span>
          <Tag ton={ton}>{majuscule(AVIS_LIBELLE[a.pire])}</Tag>
          {a.autres.length > 0 && <span className="cap">aussi : {a.autres.map((c) => AVIS_LIBELLE[c]).join(', ')}</span>}
        </p>
        <p className="bandeau-avis-detail">
          Dernier prélèvement concerné le {fmt.date(a.dernier)}. Les données ne disent pas si une consigne est toujours en vigueur : la mairie et l’ARS
          font foi.
        </p>
        <Link className="link-arrow" to={{ search: `?annee=${anneeEnCours}`, hash: '#avis' }}>
          Voir l’avis <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  )
}

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJson } from '../lib/hooks'
import {
  chercher,
  choixRequis,
  entreesCommunes,
  entreesReseaux,
  entreesServices,
  indexer,
  libelleResultat,
  lienFiche,
  normaliser,
  type EntreeFiche,
  type FichierCommunes,
  type FichierReseaux,
  type FichierServices,
  type TypeResultat,
} from '../lib/recherche'

/** Pictogramme de type, sans voyant (décision du 23/09) ; le type se lit aussi dans le titre du groupe. */
const PICTOS: Record<TypeResultat, ReactNode> = {
  commune: <path d="M8 14.3s4.6-4.3 4.6-7.8a4.6 4.6 0 0 0-9.2 0c0 3.5 4.6 7.8 4.6 7.8zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z" />,
  service: <path d="M2.5 14V6.6L8 3l5.5 3.6V14M6.2 14v-3.4h3.6V14" />,
  reseau: <path d="M1.5 4.5h13M4.5 4.5v7h7v-7M8 11.5v3" />,
}

/** Pictogramme du type d'une fiche (recherche, exemples de l'accueil). */
export function PictoType({ type }: { type: TypeResultat }) {
  return (
    <svg className="search-picto" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {PICTOS[type]}
    </svg>
  )
}

/**
 * Recherche unique (maquette du 23/09) : communes, services d'eau et syndicats, réseaux, par nom ou par code,
 * résultats groupés par type (classement : lib/recherche.ts). Combobox ARIA 1.2 : listbox en groupes titrés,
 * option active annoncée par aria-activedescendant. Index chargé en deux temps : communes et noms de
 * départements au premier focus, services et réseaux dès deux caractères, pour qu'un visiteur qui cherche sa
 * commune ne paie pas les 300 Ko compressés des deux autres fichiers.
 *
 * Code postal (lot 2 de la refonte, 05/10) : cinq chiffres proposent les communes de ce code, puis la commune dont c'est
 * le code INSEE. Quand le code désigne plusieurs fiches (`choixRequis`), aucune option n'est présélectionnée : ni Entrée
 * ni le bouton n'ouvrent une fiche avant que le visiteur en ait choisi une. `bouton` ajoute le bouton de l'accueil.
 */
export default function Search({
  autoFocus = false,
  placeholder = 'Commune ou code postal',
  label = 'Rechercher une commune par son nom ou son code postal, un service d’eau ou un réseau',
  bouton,
}: {
  autoFocus?: boolean
  placeholder?: string
  label?: string
  /** texte d'un bouton de validation à droite du champ (accueil : « Voir mon eau ») */
  bouton?: string
}) {
  const [actif, setActif] = useState(autoFocus)
  const [q, setQ] = useState('')
  const requete = useDeferredValue(q)
  const assez = normaliser(requete, false).length >= 2
  const [large, setLarge] = useState(false)
  useEffect(() => {
    if (assez) setLarge(true)
  }, [assez])

  const communes = useJson<FichierCommunes>(actif ? 'recherche/communes.json' : null)
  const departements = useJson<Record<string, string>>(actif ? 'recherche/departements.json' : null)
  const services = useJson<FichierServices>(large ? 'recherche/services.json' : null)
  const reseaux = useJson<FichierReseaux>(large ? 'recherche/reseaux.json' : null)
  // Un index par fichier : l'arrivée d'un fichier ne refait pas les autres (35 000 communes, 70 ms).
  const iCommunes = useMemo(() => indexer(communes.data ? entreesCommunes(communes.data) : []), [communes.data])
  const iServices = useMemo(() => indexer(services.data ? entreesServices(services.data) : []), [services.data])
  const iReseaux = useMemo(() => indexer(reseaux.data ? entreesReseaux(reseaux.data) : []), [reseaux.data])
  const index = useMemo(() => [...iCommunes, ...iServices, ...iReseaux], [iCommunes, iServices, iReseaux])
  const groupes = useMemo(() => (assez ? chercher(requete, index) : []), [assez, requete, index])
  const options = useMemo<EntreeFiche[]>(() => groupes.flatMap((g) => g.entrees), [groupes])
  const choix = useMemo(() => choixRequis(requete, groupes), [requete, groupes])

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Choix explicite (flèches, survol) : sans lui, une saisie ambiguë n'a aucune option active.
  const [explicite, setExplicite] = useState(false)
  const courant = choix && !explicite ? -1 : active
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const id = useId()
  const listId = `${id}-liste`
  const optionId = (i: number) => `${id}-option-${i}`
  const showList = open && options.length > 0
  const charge = !communes.data || (large && (!services.data || !reseaux.data))
  const panne = communes.error ?? services.error ?? reseaux.error
  // Sans message, une recherche sans résultat ne disait rien du tout (étude UX du 23/09).
  const etat =
    !open || !assez || options.length
      ? null
      : panne
        ? 'L’index de recherche n’a pas pu être chargé. Réessayez dans un instant.'
        : charge
          ? 'Chargement de l’index de recherche…'
          : 'Aucune commune, aucun service d’eau ni aucun réseau ne correspond à cette recherche. La recherche accepte aussi un code postal, un code INSEE, un code SISPEA ou un code de réseau.'

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // L'option choisie au clavier reste visible dans une liste qui défile (jusqu'à quatorze résultats, davantage pour un code postal).
  useEffect(() => {
    if (showList && courant >= 0) document.getElementById(optionId(courant))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courant, showList])

  const go = (e: EntreeFiche) => {
    setOpen(false)
    setQ('')
    nav(lienFiche(e))
  }
  // Entrée ou bouton : la fiche de l'option active ; sans option active (saisie ambiguë, ou rien encore), la liste.
  const valider = () => {
    if (assez && courant >= 0 && options[courant]) go(options[courant])
    else {
      setActif(true)
      setOpen(true)
      champ.current?.focus()
    }
  }

  const champRecherche = (
    <input
      ref={champ}
      className="search"
      type="search"
      role="combobox"
      aria-label={label}
      aria-expanded={showList}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={showList && courant >= 0 ? optionId(courant) : undefined}
      autoComplete="off"
      spellCheck={false}
      value={q}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => {
        setQ(e.target.value)
        setOpen(true)
        setActive(0)
        setExplicite(false)
      }}
      onFocus={() => {
        setActif(true)
        setOpen(true)
      }}
      // Ferme au Tab (clavier sans souris) ; un clic sur un résultat empêche ce blur (mousedown sans défaut).
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setOpen(true)
          setExplicite(true)
          setActive(courant < 0 ? 0 : Math.min(courant + 1, Math.max(options.length - 1, 0)))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setExplicite(true)
          setActive(Math.max(courant - 1, 0))
        } else if (e.key === 'Enter') {
          if (showList && courant >= 0 && options[courant]) {
            e.preventDefault()
            go(options[courant])
          } else if (choix) {
            e.preventDefault()
            setOpen(true)
          }
        } else if (e.key === 'Escape') {
          // Échap ferme d'abord la liste ; seulement ensuite ce qui l'entoure (le menu mobile, App.tsx).
          if (showList) e.stopPropagation()
          setOpen(false)
        }
      }}
    />
  )

  return (
    <div className={`search-box${bouton ? ' avec-bouton' : ''}`} ref={box}>
      {bouton ? (
        <div className="search-ligne">
          {champRecherche}
          {/* mousedown sans défaut : le champ garde le focus, et la liste reste ouverte pour une saisie ambiguë. */}
          <button type="button" className="btn btn-primary search-go" onMouseDown={(e) => e.preventDefault()} onClick={valider}>
            {bouton}
          </button>
        </div>
      ) : (
        champRecherche
      )}
      {showList && (
        <div className="search-results" id={listId} role="listbox" aria-label="Résultats de la recherche">
          {groupes.map((g) => (
            <div key={g.type} className="search-groupe" role="group" aria-labelledby={`${id}-${g.type}`}>
              <div className="search-groupe-titre" id={`${id}-${g.type}`} role="presentation">
                {g.titre}
              </div>
              {g.entrees.map((e) => {
                const i = options.indexOf(e)
                const l = libelleResultat(e, requete, departements.data)
                return (
                  <div
                    key={`${e.type}-${e.id}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === courant}
                    className={`search-option${i === courant ? ' active' : ''}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      go(e)
                    }}
                    onMouseMove={() => {
                      if (i !== courant) {
                        setActive(i)
                        setExplicite(true)
                      }
                    }}
                  >
                    <PictoType type={e.type} />
                    <span className="search-txt">
                      <span className="search-nom">{l.nom}</span>
                      <span className="search-meta">{l.meta}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      {/* Saisie ambiguë : annoncée aux lecteurs d'écran ; à l'écran, les libellés disent code postal et code INSEE. */}
      <p className="sr-only" role="status">
        {showList && choix ? `${options.length} fiches correspondent à ce code. Choisissez-en une dans la liste avec les flèches.` : ''}
      </p>
      {etat && (
        <p className="search-etat" role="status">
          {etat}
        </p>
      )}
    </div>
  )
}

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJson } from '../lib/hooks'
import {
  chercher,
  entreesCommunes,
  entreesReseaux,
  entreesServices,
  indexer,
  lienFiche,
  normaliser,
  precision,
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
 */
export default function Search({
  autoFocus = false,
  placeholder = 'Commune, syndicat, réseau ou code…',
  label = 'Rechercher une commune, un service d’eau ou un réseau',
}: {
  autoFocus?: boolean
  placeholder?: string
  label?: string
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

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)
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
          : 'Aucune commune, aucun service ni réseau ne correspond. Essayez un code INSEE, SISPEA ou de réseau.'

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  // L'option choisie au clavier reste visible dans une liste qui défile (jusqu'à quatorze résultats).
  useEffect(() => {
    if (showList) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, showList])

  const go = (e: EntreeFiche) => {
    setOpen(false)
    setQ('')
    nav(lienFiche(e))
  }

  return (
    <div className="search-box" ref={box}>
      <input
        className="search"
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setActive(0)
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
            setActive((a) => Math.min(a + 1, Math.max(options.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && showList && options[active]) {
            e.preventDefault()
            go(options[active])
          } else if (e.key === 'Escape') {
            // Échap ferme d'abord la liste ; seulement ensuite ce qui l'entoure (le menu mobile, App.tsx).
            if (showList) e.stopPropagation()
            setOpen(false)
          }
        }}
      />
      {showList && (
        <div className="search-results" id={listId} role="listbox" aria-label="Résultats de la recherche">
          {groupes.map((g) => (
            <div key={g.type} className="search-groupe" role="group" aria-labelledby={`${id}-${g.type}`}>
              <div className="search-groupe-titre" id={`${id}-${g.type}`} role="presentation">
                {g.titre}
              </div>
              {g.entrees.map((e) => {
                const i = options.indexOf(e)
                return (
                  <div
                    key={`${e.type}-${e.id}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    className={`search-option${i === active ? ' active' : ''}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      go(e)
                    }}
                    onMouseMove={() => i !== active && setActive(i)}
                  >
                    <PictoType type={e.type} />
                    <span className="search-txt">
                      <span className="search-nom">{e.nom}</span>
                      <span className="search-meta">{precision(e, departements.data)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      {etat && (
        <p className="search-etat" role="status">
          {etat}
        </p>
      )}
    </div>
  )
}

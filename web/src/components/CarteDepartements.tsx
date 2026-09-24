import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { classeArdoise, ETIQUETTES_ARDOISE, etiquettesVisibles, lignesDepartements, lignesEtiquette, pctCarte, type LigneDepartement } from '../lib/carte'
import { fmt } from '../lib/data'
import { nonConformes, reseauxAnalyses, type FamilleSitu, type Repartition } from '../lib/situations'

/** geo/departements-svg.json (pipeline/robinet/geo_svg.py). */
export interface CarteSvg {
  viewBox: string
  departements: { code: string; nom: string; d: string; cx: number; cy: number }[]
  outre_mer: { code: string; nom: string; viewBox: string; d: string; cx: number; cy: number }[]
}

/** Paris et la petite couronne, illisibles à l'échelle de la France : leur vignette les agrandit, sans nom sur la grande carte. */
const PETITE_COURONNE = ['75', '92', '93', '94']
/** Taille des noms à l'écran, en px, quelle que soit la largeur de la carte ; ceux qui ne tiennent pas s'effacent. */
const TAILLE_NOM = 11

function lireNoms(): boolean {
  try {
    return localStorage.getItem('carte-noms') !== '0'
  } catch {
    return true
  }
}

/**
 * Carte des départements de l'accueil (maquette du 23/09) : part des réseaux non conformes, toutes familles, sur la
 * rampe ardoise (un agrégat n'a pas de sémaphore) ; hachures sans réseau analysé. À côté : légende, lecture au survol
 * ou au choix, tableau des départements ; dessous, vignettes de la petite couronne et de l'outre-mer. Les noms
 * suivent le réglage « Noms » des autres cartes (carte-noms), et s'effacent quand ils se chevauchent.
 */
export default function CarteDepartements({
  carte,
  depts,
  france,
  annee,
}: {
  carte: CarteSvg
  depts: Record<string, Partial<Record<FamilleSitu, Repartition>>>
  france: Repartition | undefined
  annee: string
}) {
  const id = useId()
  const noms = useMemo(() => Object.fromEntries([...carte.departements, ...carte.outre_mer].map((d) => [d.code, d.nom])), [carte])
  const lignes = useMemo(() => lignesDepartements(depts, noms), [depts, noms])
  const parCode = useMemo(() => new Map(lignes.map((l) => [l.code, l])), [lignes])
  const [survol, setSurvol] = useState<string | null>(null)
  const [choix, setChoix] = useState<string | null>(null)
  const [avecNoms, setAvecNoms] = useState(lireNoms)
  const svg = useRef<SVGSVGElement>(null)
  const [echelle, setEchelle] = useState(0)
  const [visibles, setVisibles] = useState<Set<string>>(new Set())
  const [vueIdf, setVueIdf] = useState<string | null>(null)
  const [, , largeur = 1000, hauteur = 1000] = carte.viewBox.split(' ').map(Number)

  // Échelle du dessin (px par unité), suivie au redimensionnement : les noms gardent leur taille à l'écran.
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const mesure = () => setEchelle(el.getBoundingClientRect().width / largeur)
    mesure()
    const obs = new ResizeObserver(mesure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [largeur])

  // Noms qui tiennent, mesurés dans le navigateur : le plus grand département d'abord ; puis la vignette de la
  // petite couronne, cadrée sur ses quatre départements.
  useLayoutEffect(() => {
    const el = svg.current
    if (!el || !echelle) return
    const aire = (code: string) => {
      const p = el.querySelector<SVGPathElement>(`path[data-code="${code}"]`)?.getBBox()
      return p ? p.width * p.height : 0
    }
    const boites = [...el.querySelectorAll<SVGTextElement>('text[data-code]')].map((t) => {
      const b = t.getBBox()
      return { code: t.dataset.code!, x: b.x, y: b.y, w: b.width, h: b.height, priorite: aire(t.dataset.code!) }
    })
    setVisibles(etiquettesVisibles(boites, 2 / echelle, { largeur, hauteur }))
    const cadres = PETITE_COURONNE.map((c) => el.querySelector<SVGPathElement>(`path[data-code="${c}"]`)?.getBBox()).filter((b): b is DOMRect => !!b)
    if (cadres.length) {
      const x0 = Math.min(...cadres.map((b) => b.x))
      const y0 = Math.min(...cadres.map((b) => b.y))
      const x1 = Math.max(...cadres.map((b) => b.x + b.width))
      const y1 = Math.max(...cadres.map((b) => b.y + b.height))
      setVueIdf(`${x0 - 1.5} ${y0 - 1.5} ${x1 - x0 + 3} ${y1 - y0 + 3}`)
    }
  }, [echelle, avecNoms, carte, largeur, hauteur])

  /** Classe de la rampe (ou hachures sans réseau analysé) et états d'une zone. */
  const zone = (code: string, ...etats: (string | false)[]) => {
    const c = classeArdoise(parCode.get(code)?.part)
    return { className: [`carte-m${c}`, ...etats].filter(Boolean).join(' '), ...(c ? {} : { fill: `url(#${id}-hachures)` }) }
  }
  const actif = survol ?? choix
  const ligneActive: LigneDepartement | null = actif ? (parCode.get(actif) ?? null) : null
  const franceLigne = france ? { nom: 'France entière', part: reseauxAnalyses(france) ? nonConformes(france, 'toutes') / reseauxAnalyses(france) : null, nonConformes: nonConformes(france, 'toutes'), analyses: reseauxAnalyses(france) } : null
  const lue = ligneActive ?? franceLigne
  const sansDonnee = lignes.some((l) => l.part == null)
  const titre = (code: string) => {
    const l = parCode.get(code)
    return l ? `${l.nom} : ${l.part == null ? 'aucun réseau analysé' : `${pctCarte(l.part)} des réseaux non conformes`}` : code
  }
  const survoler = (e: { target: EventTarget }) => setSurvol((e.target as Element).closest('path[data-code]')?.getAttribute('data-code') ?? null)
  const choisir = (e: { target: EventTarget }) => {
    const code = (e.target as Element).closest('path[data-code]')?.getAttribute('data-code')
    if (code) setChoix((c) => (c === code ? null : code))
  }
  const basculerNoms = () =>
    setAvecNoms((v) => {
      try {
        localStorage.setItem('carte-noms', v ? '0' : '1')
      } catch {
        /* stockage indisponible : le choix vaut pour cette visite */
      }
      return !v
    })

  return (
    <div className="carte-france">
      <div className="carte-dessin">
        <svg
          ref={svg}
          className={`carte-svg${avecNoms ? '' : ' sans-noms'}`}
          viewBox={carte.viewBox}
          role="img"
          aria-labelledby={`${id}-titre ${id}-desc`}
          onPointerMove={survoler}
          onPointerLeave={() => setSurvol(null)}
          onClick={choisir}
        >
          <title id={`${id}-titre`}>Réseaux non conformes par département en {annee}</title>
          <desc id={`${id}-desc`}>
            Carte de la France métropolitaine en cinq nuances de gris, de la plus discrète (moins de 5 % des réseaux non conformes) à la plus marquée (40 % et plus). Le tableau des
            départements donne les mêmes chiffres.
          </desc>
          <defs>
            <pattern id={`${id}-hachures`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className="carte-hachures-fond" />
              <line x1="0" y1="0" x2="0" y2="6" className="carte-hachures-trait" />
            </pattern>
          </defs>
          {carte.departements.map((d) => (
            <path key={d.code} data-code={d.code} d={d.d} {...zone(d.code, d.code === actif && 'actif', d.code === choix && 'choisi')}>
              <title>{titre(d.code)}</title>
            </path>
          ))}
          {avecNoms &&
            echelle > 0 &&
            carte.departements
              .filter((d) => !PETITE_COURONNE.includes(d.code))
              .map((d) => {
                const l = lignesEtiquette(d.nom)
                const t = TAILLE_NOM / echelle
                return (
                  <text
                    key={d.code}
                    data-code={d.code}
                    x={d.cx}
                    y={d.cy - ((l.length - 1) * t) / 2}
                    className="carte-nom"
                    fontSize={t}
                    strokeWidth={3 / echelle}
                    visibility={visibles.has(d.code) ? 'visible' : 'hidden'}
                    aria-hidden="true"
                  >
                    {l.map((ligne, i) => (
                      <tspan key={i} x={d.cx} dy={i ? t * 1.05 : t * 0.35}>
                        {ligne}
                      </tspan>
                    ))}
                  </text>
                )
              })}
        </svg>
        <div className="carte-vignettes" role="group" aria-label="Encarts : Paris et petite couronne, outre-mer">
          <div className="carte-vignette">
            {vueIdf && (
              <svg viewBox={vueIdf} aria-hidden="true" focusable="false" onPointerMove={survoler} onPointerLeave={() => setSurvol(null)} onClick={choisir}>
                {carte.departements
                  .filter((d) => PETITE_COURONNE.includes(d.code))
                  .map((d) => (
                    <path key={d.code} data-code={d.code} d={d.d} {...zone(d.code, d.code === actif && 'actif', d.code === choix && 'choisi')} />
                  ))}
              </svg>
            )}
            <span>Paris et petite couronne</span>
          </div>
          {carte.outre_mer.map((d) => (
            <button
              key={d.code}
              type="button"
              className={`carte-vignette${d.code === choix ? ' choisi' : ''}`}
              aria-pressed={d.code === choix}
              aria-label={titre(d.code)}
              onClick={() => setChoix((c) => (c === d.code ? null : d.code))}
              onPointerEnter={() => setSurvol(d.code)}
              onPointerLeave={() => setSurvol(null)}
            >
              <svg viewBox={d.viewBox} aria-hidden="true" focusable="false">
                <path d={d.d} {...zone(d.code)} />
              </svg>
              <span>{d.nom}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="carte-cote">
        <div className="carte-reglages">
          <p className="carte-legende-titre">Part des réseaux non conformes, en %</p>
          <button type="button" className="carte-noms" aria-pressed={avecNoms} onClick={basculerNoms} title={avecNoms ? 'Masquer les noms sur la carte' : 'Afficher les noms sur la carte'}>
            Noms
          </button>
        </div>
        <div className="carte-legende" aria-hidden="true">
          {ETIQUETTES_ARDOISE.map((_, i) => (
            <span key={`c${i}`} className={`carte-case carte-fond-m${i + 1}`} />
          ))}
          {ETIQUETTES_ARDOISE.map((t) => (
            <span key={t} className="carte-borne">
              {t}
            </span>
          ))}
        </div>
        {sansDonnee && <p className="carte-note">Hachures : aucun réseau analysé.</p>}
        <div className="carte-lecture" aria-live="polite">
          {lue && (
            <>
              <span className="carte-lecture-nom">{lue.nom}</span>
              {lue.part == null ? (
                <span className="carte-lecture-detail">aucun réseau analysé</span>
              ) : (
                <>
                  {/* La France, chiffre de tête de la section, garde sa décimale ; un département suit la règle de la carte. */}
                  <span className="carte-lecture-part">{ligneActive ? pctCarte(lue.part) : fmt.pct(100 * lue.part, 1)}</span>
                  <span className="carte-lecture-detail">
                    des réseaux non conformes · {fmt.int(lue.nonConformes)} sur {fmt.int(lue.analyses)} analysé{lue.analyses > 1 ? 's' : ''}
                  </span>
                </>
              )}
              {ligneActive ? (
                <Link to={`/departement/${ligneActive.code}`} className="carte-lecture-lien">
                  Voir le département <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <span className="carte-lecture-aide">Survolez ou touchez un département.</span>
              )}
            </>
          )}
        </div>
        <details className="carte-tableau">
          <summary>
            Tableau des départements <span className="muted">{lignes.length}</span>
          </summary>
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Réseaux non conformes par département en {annee}, de la plus forte part à la plus faible</caption>
              <thead>
                <tr>
                  <th scope="col">Département</th>
                  <th scope="col" className="num">
                    Part
                  </th>
                  <th scope="col" className="num">
                    Non conformes
                  </th>
                  <th scope="col" className="num">
                    Analysés
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.code}>
                    <td>
                      <Link to={`/departement/${l.code}`}>{l.nom}</Link>
                    </td>
                    <td className="num">{l.part == null ? '–' : pctCarte(l.part)}</td>
                    <td className="num">{l.part == null ? '–' : fmt.int(l.nonConformes)}</td>
                    <td className="num">{l.part == null ? '–' : fmt.int(l.analyses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}

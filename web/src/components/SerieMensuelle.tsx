import { useLayoutEffect, useRef, useState } from 'react'
import { accord, fmt } from '../lib/data'
import { NBSP } from '../lib/instruments'
import { echelleSerie, nomMois, resumeSerie, type MoisSerie } from '../lib/serie'

const INITIALES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * Maximum de chaque mois de l'année choisie, face à la limite de qualité (maquette du 23/09) : une seule échelle,
 * limite toujours dans le cadre, douze emplacements même sans analyse (« – »). SVG dessiné à la largeur réelle
 * (textes nets), sans ECharts. `juge` : série d'un réseau, dont les mois au-dessus de la limite prennent le ton
 * « non conforme » ; sinon (plusieurs réseaux réunis) tout reste neutre, comme les autres agrégats. Les valeurs sont
 * reprises dans un tableau pour les lecteurs d'écran.
 */
export default function SerieMensuelle({
  titre,
  serie,
  annee,
  unite,
  limite,
  juge = true,
  compact = false,
}: {
  /** légende du tableau lu par les lecteurs d'écran */
  titre: string
  serie: MoisSerie[]
  annee: string
  unite: string
  limite: number | null
  juge?: boolean
  compact?: boolean
}) {
  const boite = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(0)
  useLayoutEffect(() => {
    const el = boite.current
    if (!el) return
    const mesurer = () => setLargeur(Math.round(el.clientWidth))
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const r = resumeSerie(serie)
  const { haut, graduations } = echelleSerie(r.maximum, limite)
  const W = Math.max(compact ? 220 : 280, largeur || (compact ? 320 : 640))
  const H = compact ? 150 : W < 520 ? 190 : 220
  const m = { t: 24, r: 8, b: 24, l: compact ? 36 : 44 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const y = (v: number) => m.t + ih - (Math.min(v, haut) / haut) * ih
  const bande = iw / 12
  const bw = Math.min(compact ? 14 : 24, bande * 0.56)
  const parMois = new Map(serie.map((x) => [Number(x.mois.slice(5, 7)) - 1, x]))
  const val = (v: number) => `${fmt.sig(v)}${unite ? `${NBSP}${unite}` : ''}`
  const base = Math.round(y(0)) + 0.5

  return (
    <div className={`serie${juge ? '' : ' serie--neutre'}${compact ? ' serie--compacte' : ''}`}>
      <div className="serie-graphe" ref={boite}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
          {limite != null && <rect className="serie-zone" x={m.l} y={m.t} width={iw} height={Math.max(0, y(limite) - m.t)} />}
          {graduations
            .filter((g) => g !== limite)
            .map((g) => (
              <line key={`g${g}`} className="serie-grille" x1={m.l} x2={W - m.r} y1={Math.round(y(g)) + 0.5} y2={Math.round(y(g)) + 0.5} />
            ))}
          {[0, ...graduations].map((g) => (
            <text key={`t${g}`} x={m.l - 8} y={y(g) + 4} textAnchor="end">
              {fmt.sig(g)}
            </text>
          ))}
          {INITIALES.map((initiale, i) => {
            const x = parMois.get(i)
            const cx = m.l + bande * i + bande / 2
            const v = x?.max
            let barre = null
            if (v != null) {
              const h = Math.max(1, y(0) - y(v))
              const x0 = cx - bw / 2
              const y0 = y(v)
              const rr = Math.min(4, h, bw / 2)
              const d = `M${x0},${y(0)}V${y0 + rr}Q${x0},${y0} ${x0 + rr},${y0}H${x0 + bw - rr}Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr}V${y(0)}Z`
              barre = <path className={`serie-barre${limite != null && v > limite ? ' au-dessus' : ''}`} d={d} />
            }
            const bulle = !x || !x.analyses
              ? `${nomMois(`${annee}-${String(i + 1).padStart(2, '0')}`)} ${annee} : aucune analyse`
              : `${nomMois(x.mois)} ${annee} : ${v != null ? `${val(v)} au plus, ` : ''}${fmt.nb(x.analyses, 'analyse')}${x.depassements ? `, dont ${fmt.int(x.depassements)} au-dessus de la limite` : ''}`
            return (
              <g key={i} className="serie-mois">
                <title>{bulle}</title>
                <rect className="serie-cible" x={m.l + bande * i} y={m.t} width={bande} height={ih} />
                {barre ?? (
                  <text className="serie-vide" x={cx} y={y(0) - 6} textAnchor="middle">
                    –
                  </text>
                )}
                <text x={cx} y={H - 6} textAnchor="middle">
                  {initiale}
                </text>
              </g>
            )
          })}
          <line className="serie-base" x1={m.l} x2={W - m.r} y1={base} y2={base} />
          {limite != null && (
            <>
              <line className="serie-limite" x1={m.l} x2={W - m.r} y1={y(limite)} y2={y(limite)} />
              <text className="serie-limite-lab" x={W - m.r} y={y(limite) - 6} textAnchor="end">
                {compact ? 'limite' : 'limite de qualité'} {val(limite)}
              </text>
            </>
          )}
        </svg>
      </div>
      {/* Masqué dans un div : sur un <table>, `sr-only` ne borne pas la largeur et la page débordait sur mobile. */}
      <div className="sr-only">
        <table>
          <caption>{titre}</caption>
          <thead>
            <tr>
              <th scope="col">Mois</th>
              <th scope="col">Maximum</th>
              <th scope="col">Analyses</th>
              <th scope="col">Au-dessus de la limite</th>
            </tr>
          </thead>
          <tbody>
            {serie.map((x) => (
              <tr key={x.mois}>
                <th scope="row">{nomMois(x.mois)}</th>
                <td>{x.max != null ? val(x.max) : 'aucune analyse'}</td>
                <td>{fmt.int(x.analyses)}</td>
                <td>
                  {fmt.int(x.depassements)} {accord(x.depassements, 'analyse')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

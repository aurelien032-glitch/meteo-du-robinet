import type { Reglette } from '../lib/instruments'
import type { Ton } from '../lib/situations'

/**
 * Réglette d'un instrument (lib/instruments.ts) : échelle graduée aux seuils officiels, plage hors limite
 * teintée, repère de la limite à l'encre, et la valeur du réseau lue au-dessus de son repère. Sans valeur
 * (légende, famille non analysée, garde de cohérence), l'échelle seule.
 */
export default function Jauge({ reglette: r, ton, nom, libelle }: { reglette: Reglette; ton: Ton | null; nom: string; libelle?: string }) {
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - r.min) / (r.max - r.min)) * 100))
  const [de, a] = r.horsLimite
  const x = r.valeur != null ? pos(r.valeur) : null
  const bout = (g: { t: string } | undefined) => g?.t ?? ''
  const unite = r.unite === '%' ? '' : ` ${r.unite}`
  const seuil = r.graduations.find((g) => g.v === r.limite)
  const aria =
    x != null
      ? `${nom} : ${r.lecture}${libelle ? `, ${libelle}` : ''}`
      : `${nom} : échelle de ${bout(r.graduations[0])} à ${bout(r.graduations.at(-1))}${unite}${seuil ? `, seuil ${seuil.t}${unite}` : ''}`
  return (
    <div className={`jauge${x == null ? ' jauge--nue' : ''}`} role="img" aria-label={aria}>
      <div className="j-piste">
        <div className="j-fond">
          <span className="j-zone" style={{ left: `${pos(de)}%`, width: `${pos(a) - pos(de)}%` }} />
        </div>
        {r.reperes.map((v) => (
          <span key={v} className={`j-repere${v === r.limite ? ' j-repere--limite' : ''}`} style={{ left: `${pos(v)}%` }} />
        ))}
        {x != null && (
          <span className={`j-marque tone-${ton ?? 'na'}`} style={{ left: `${x}%` }}>
            <span className={`j-lecture${x > 84 ? ' fin' : x < 16 ? ' debut' : ''}`}>{r.lecture}</span>
          </span>
        )}
      </div>
      <div className="j-echelle">
        {r.graduations.map((g) => {
          const gx = pos(g.v)
          return (
            <span key={g.v} className={`j-grad${gx <= 0.5 ? ' debut' : gx >= 99.5 ? ' fin' : ''}${g.v === r.limite ? ' limite' : ''}`} style={{ left: `${gx}%` }}>
              {g.t}
            </span>
          )
        })}
      </div>
    </div>
  )
}

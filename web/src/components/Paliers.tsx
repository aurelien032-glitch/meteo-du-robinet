import type { CSSProperties } from 'react'
import type { Ton } from '../lib/situations'

/**
 * Échelle par classes : pesticides et métaux avec les tons de leur bilan, sécheresse et nappes en gris (sans ton).
 * Les classes non conformes sont teintées ; la classe atteinte est pleine, dans son ton, ou à l'encre pour une
 * échelle grise. Échelle longue (plus de quatre classes) : extrémités dessous, classe atteinte lue au-dessus,
 * comme sur une réglette.
 */
export default function Paliers({
  classes,
  actif,
  nom,
  compact = classes.length > 4,
}: {
  classes: { t: string; ton?: Ton }[]
  actif: number | null
  nom: string
  compact?: boolean
}) {
  const n = classes.length
  const on = actif != null && actif >= 0 && actif < n ? actif : null
  const aria = on != null ? `${nom} : ${classes[on].t}` : `${nom} : échelle ${classes.map((c) => c.t.toLowerCase()).join(', ')}`
  return (
    <div className={`paliers${compact ? ' paliers--compact' : ''}`} style={{ '--n': n } as CSSProperties} role="img" aria-label={aria}>
      {compact && on != null && (
        <div className="p-lecture-rang">
          <span className={`p-lecture${on === 0 ? ' debut' : on === n - 1 ? ' fin' : ''}`} style={{ left: `${on === 0 ? 0 : on === n - 1 ? 100 : ((on + 0.5) / n) * 100}%` }}>
            {classes[on].t}
          </span>
        </div>
      )}
      <div className="p-rang">
        {classes.map((c, i) => (
          <span
            key={i}
            className={`p-palier${c.ton === 'warn' ? ' p-palier--warn' : c.ton === 'bad' ? ' p-palier--bad' : ''}${i === on ? ` actif tone-${c.ton ?? 'neutre'}` : ''}`}
          />
        ))}
      </div>
      {compact ? (
        <div className="p-bouts">
          <span>{classes[0]?.t}</span>
          <span>{classes[n - 1]?.t}</span>
        </div>
      ) : (
        <div className="p-libelles">
          {classes.map((c, i) => (
            <span key={i} className={i === on ? 'actif' : undefined}>
              {c.t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SCENES } from '../scenes'
import { usePageTitle } from '../lib/title'

/** Une scène vidéo : un écran 16:9 par idée, en mode studio, exportable en série. */
export default function Scene() {
  const { id } = useParams()
  const scene = SCENES.find((s) => s.id === id)
  usePageTitle(scene ? `Scène · ${scene.titre}` : 'Scènes vidéo')
  useEffect(() => {
    if (scene) window.dispatchEvent(new CustomEvent('robinet:studio', { detail: true }))
  }, [scene])

  if (!id) {
    return (
      <div>
        <h1>Scènes vidéo</h1>
        <p className="lead">Chaque scène ouvre en mode studio, 1920×1080. Ajoutez <code>?annee=2025</code> pour fixer le millésime, ou exportez toutes les scènes en PNG avec <code>npm run scenes:export</code>.</p>
        <div className="grid cols-3">
          {SCENES.map((s) => (
            <Link key={s.id} to={`/scene/${s.id}`} className="card theme-card">
              <h3>{s.titre}</h3>
              <p className="muted">{s.sousTitre}</p>
            </Link>
          ))}
        </div>
      </div>
    )
  }
  if (!scene) return <p className="muted">Scène inconnue.</p>
  const C = scene.Component
  return (
    <div className="scene" data-scene={scene.id}>
      <div className="scene-head">
        <h1>{scene.titre}</h1>
        <p>{scene.sousTitre}</p>
      </div>
      <div className="scene-body">
        <C />
      </div>
      <div className="scene-foot">Source : {scene.source}. robinet, données publiques.</div>
    </div>
  )
}

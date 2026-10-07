import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SCENES } from '../scenes'
import { usePageTitle } from '../lib/title'

/** Une scène vidéo : un écran 16:9 par idée, en mode studio, exportable en série. */
export default function Scene() {
  const { id } = useParams()
  const scene = SCENES.find((s) => s.id === id)
  // Description propre à chaque scène : sans elle, la page reprenait la description générique du site (vérification du 24/09).
  usePageTitle(
    scene ? `Scène · ${scene.titre}` : 'Scènes vidéo',
    scene ? `${scene.titre} : ${scene.sousTitre}` : "Écrans au format 16:9 destinés à la vidéo ou à la projection, consacrés chacun à une idée et établis à partir des données publiques de l'eau potable.",
  )
  useEffect(() => {
    if (scene) window.dispatchEvent(new CustomEvent('robinet:studio', { detail: true }))
  }, [scene])

  if (!id) {
    return (
      <div>
        <h1>Scènes vidéo</h1>
        {/* Plus de consigne de développeur (« npm run scenes:export ») sur une page publique (vérification du 24/09). */}
        <p className="lead">
          Chaque scène s’affiche en plein écran, au format 16:9 (1920 × 1080), pour la vidéo ou la projection. Ajoutez <code>?annee=2025</code> à
          l’adresse pour fixer l’année.
        </p>
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
      <div className="scene-foot">Source : {scene.source}. Météo du robinet, données publiques.</div>
    </div>
  )
}

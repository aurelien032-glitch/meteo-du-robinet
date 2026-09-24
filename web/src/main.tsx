import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
// Polices (Atkinson Hyperlegible Next et Mono) déclarées en @font-face dans styles.css et servies
// depuis /fonts/atkinson : aucun appel à un service extérieur.
import 'maplibre-gl/dist/maplibre-gl.css' // avant styles.css : sinon ses règles écrasent les nôtres
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

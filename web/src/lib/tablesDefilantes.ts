import { useEffect } from 'react'

/**
 * Tableaux défilants atteignables au clavier (étude UX du 23/09, axe-core « scrollable-region-focusable ») :
 * un `.table-scroll` qui déborde reçoit tabindex="0", role="region" et le nom de sa légende, sans quoi ses
 * colonnes cachées ne se font défiler qu'à la souris ou au doigt. Posé une fois pour tout le site : les
 * tableaux arrivent après leurs données et débordent ou non selon la largeur de l'écran.
 */
export function useTablesDefilantes() {
  useEffect(() => {
    const regler = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.table-scroll')) {
        const deborde = el.scrollWidth > el.clientWidth + 1
        if (deborde && !el.dataset.defilant) {
          el.dataset.defilant = '1'
          el.tabIndex = 0
          el.setAttribute('role', 'region')
          const nom = el.querySelector('caption')?.textContent?.trim() || el.closest('.card')?.querySelector('h2, h3')?.textContent?.trim()
          el.setAttribute('aria-label', nom ? `Tableau : ${nom}` : 'Tableau défilant')
        } else if (!deborde && el.dataset.defilant) {
          delete el.dataset.defilant
          el.removeAttribute('tabindex')
          el.removeAttribute('role')
          el.removeAttribute('aria-label')
        }
      }
    }
    let image = 0
    const planifier = () => {
      cancelAnimationFrame(image)
      image = requestAnimationFrame(regler)
    }
    const observateur = new MutationObserver(planifier)
    observateur.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', planifier)
    planifier()
    return () => {
      observateur.disconnect()
      window.removeEventListener('resize', planifier)
      cancelAnimationFrame(image)
    }
  }, [])
}

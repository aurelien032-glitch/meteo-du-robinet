import { useId, useState, type FormEvent } from 'react'
import { envoyerSignalement, MESSAGE_MAX, MESSAGE_MIN } from '../lib/signalement'

/**
 * « Signaler une erreur sur cette page » (maquette 13 du canevas, validée le 2026-10-07) : un message seul, envoyé avec
 * l'adresse de la page et l'année affichée, sans donnée personnelle (lib/signalement.ts). Un champ piège, invisible, écarte
 * les robots qui remplissent tous les champs : rempli, l'envoi n'a pas lieu mais la confirmation s'affiche.
 */
export default function Signalement({ annee }: { annee?: string }) {
  const id = useId()
  const [message, setMessage] = useState('')
  const [piege, setPiege] = useState('')
  const [etat, setEtat] = useState<'saisie' | 'envoi' | 'envoye' | 'erreur'>('saisie')
  const assez = message.trim().length >= MESSAGE_MIN

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (!assez || etat === 'envoi') return
    if (piege) {
      setEtat('envoye')
      return
    }
    setEtat('envoi')
    try {
      await envoyerSignalement({ page: window.location.href, annee: annee ?? '', message })
      setMessage('')
      setEtat('envoye')
    } catch {
      setEtat('erreur')
    }
  }

  if (etat === 'envoye')
    return (
      <div className="signalement" role="status">
        <p className="carte2-avis carte2-avis--neutre">
          <span className="pastille-avis" aria-hidden="true" />
          <span>Le signalement a été transmis à l’éditeur, avec l’adresse de cette page. Il sera examiné ; aucune réponse n’est envoyée, faute d’adresse.</span>
        </p>
        <button type="button" className="btn-link" onClick={() => setEtat('saisie')}>
          Envoyer un autre signalement
        </button>
      </div>
    )

  return (
    <form className="signalement" onSubmit={envoyer}>
      <p className="carte2-ligne">
        Une information qui paraît inexacte peut être signalée à l’éditeur. L’adresse de cette page et l’année affichée sont jointes au
        message ; aucune donnée personnelle n’est demandée.
      </p>
      <label htmlFor={`${id}-message`} className="signalement-libelle">
        Ce qui paraît inexact
      </label>
      <textarea
        id={`${id}-message`}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        minLength={MESSAGE_MIN}
        maxLength={MESSAGE_MAX}
        required
        aria-describedby={`${id}-aide`}
      />
      <p id={`${id}-aide`} className="carte2-note">
        {MESSAGE_MIN} caractères au moins, {MESSAGE_MAX} au plus.
      </p>
      {/* Champ piège : hors de la page pour les visiteurs et les lecteurs d'écran, rempli par les robots. */}
      <div className="signalement-piege">
        <label>
          Site web
          <input type="text" tabIndex={-1} autoComplete="off" value={piege} onChange={(e) => setPiege(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!assez || etat === 'envoi'}>
        {etat === 'envoi' ? 'Envoi en cours…' : 'Envoyer le signalement'}
      </button>
      {etat === 'erreur' && (
        <p className="carte2-ligne" role="alert">
          Le signalement n’a pas pu être envoyé, sans doute faute de connexion. Un nouvel essai est possible.
        </p>
      )}
      <p className="carte2-note">
        Une donnée qui provient d’une source publique ne peut être corrigée que par son producteur ; pour une consigne sanitaire, la mairie et
        l’ARS font foi.
      </p>
    </form>
  )
}

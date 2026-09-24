import { Link } from 'react-router-dom'
import Crumbs from '../components/Crumbs'
import { useJson } from '../lib/hooks'
import { usePageTitle } from '../lib/title'
import type { MetaFile } from '../lib/types'

/** Index des thèmes : les six familles de polluants, puis les services d'eau et l'amont. */
export default function Themes() {
  const meta = useJson<MetaFile>('meta.json').data
  usePageTitle('Comprendre', "Les sujets de l'eau du robinet : pesticides, nitrates, PFAS, bactériologie, avis de l'ARS, services d'eau, ressource et sécheresse.")
  return (
    <div className="page">
      <p className="eyebrow">Comprendre</p>
      <Crumbs items={[{ label: 'Comprendre' }]} />
      <h1>Comprendre l'eau du robinet</h1>
      <p className="lead">
        Chaque sujet pose une question, y répond avec une carte, un classement, les substances en cause et l'évolution mois par mois. Au robinet d'abord, puis
        tout ce qui l'entoure : le service qui distribue l'eau, la ressource qui l'alimente, la sécheresse.
      </p>
      <h2>Au robinet</h2>
      <div className="grid cols-3">
        {(meta?.themes ?? []).map((t) => (
          <Link key={t.slug} to={`/themes/${t.slug}`} className="card theme-card">
            <h3>{t.titre}</h3>
            <p className="muted">{t.question}</p>
          </Link>
        ))}
        <Link to="/avis" className="card theme-card">
          <h3>Avis sanitaires de l'ARS</h3>
          <p className="muted">Où l'eau a-t-elle été interdite, à faire bouillir, ou déconseillée aux nourrissons et aux femmes enceintes ?</p>
        </Link>
        <Link to="/hors-grille" className="card theme-card">
          <h3>Ce que la grille n'encadre pas</h3>
          <p className="muted">Perchlorate, TFA, métabolites, PFAS un par un : analysés sans limite de qualité. Les cherche-t-on, et que trouve-t-on ?</p>
        </Link>
      </div>
      <h2>Autour du robinet</h2>
      <div className="grid cols-3">
        <Link to="/services" className="card theme-card">
          <h3>Les services d'eau</h3>
          <p className="muted">Prix, fuites, renouvellement des réseaux, régie contre délégation.</p>
        </Link>
        <Link to="/amont" className="card theme-card">
          <h3>L'amont du robinet</h3>
          <p className="muted">D'où vient l'eau, dans quel état sont les nappes, ce qui est épandu au-dessus.</p>
        </Link>
        <Link to="/secheresse" className="card theme-card">
          <h3>Sécheresse</h3>
          <p className="muted">Les restrictions d'usage de l'eau en vigueur aujourd'hui, et leur historique depuis 2012.</p>
        </Link>
        <Link to="/ressource" className="card theme-card">
          <h3>Pression sur la ressource</h3>
          <p className="muted">Prélèvements, zones de déficit, fuites, protection des captages, nappes et restrictions, département par département.</p>
        </Link>
        <Link to="/nappes" className="card theme-card">
          <h3>Le niveau des nappes</h3>
          <p className="muted">Chaque mois, les nappes par rapport aux mêmes mois des années passées, de « très bas » à « très haut ».</p>
        </Link>
        <Link to="/carte" className="card theme-card">
          <h3>La carte</h3>
          <p className="muted">Départements puis communes, huit indicateurs, tous les millésimes.</p>
        </Link>
        <Link to="/methode" className="card theme-card">
          <h3>Méthode et sources</h3>
          <p className="muted">D'où viennent les chiffres, comment ils sont calculés, ce qu'ils ne disent pas.</p>
        </Link>
      </div>
    </div>
  )
}

import Section from './Section'
import { LIBELLES_TYPES, SEUILS_ARRETE, SOURCE_ARRETE, TITRES_PARTIES, type PartieArrete } from '../lib/arrete2007'
import { fmt } from '../lib/data'

const PARTIES: PartieArrete[] = ['limites-microbio', 'limites-chimie', 'references', 'radioactivite', 'valeur-indicative', 'vigilance']

/**
 * « Les seuils de l'arrêté » (Méthode, choix de l'auteur, 2026-10-05) : chaque seuil de l'annexe I de l'arrêté du
 * 11 janvier 2007 modifié, par partie, avec son point d'application, sa date d'effet différée et l'écart éventuel de
 * SISE-Eaux (lib/arrete2007.ts). Un tableau par partie, replié : 81 lignes en tout.
 */
export default function TableauArrete() {
  return (
    <div className="tableau-arrete">
      {PARTIES.map((p) => {
        const lignes = SEUILS_ARRETE.filter((s) => s.partie === p)
        const ecarts = lignes.filter((s) => s.ecart).length
        return (
          <Section
            key={p}
            id={`arrete-${p}`}
            titre={TITRES_PARTIES[p]}
            resume={`${fmt.nb(lignes.length, 'seuil', 'seuils')}${ecarts ? ` · ${fmt.nb(ecarts, 'écart', 'écarts')} avec SISE-Eaux` : ''}`}
          >
            <div className="table-scroll">
              <table className="data">
                <caption className="sr-only">{TITRES_PARTIES[p]}, arrêté du 11 janvier 2007 modifié, annexe I</caption>
                <thead>
                  <tr>
                    <th scope="col">Paramètre</th>
                    <th scope="col">Seuil</th>
                    <th scope="col">Où et quand</th>
                    <th scope="col">Dans SISE-Eaux</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((s, i) => (
                    <tr key={`${s.parametre}-${i}`}>
                      <th scope="row">
                        {s.parametre}
                        <span className="cap ta-type">{LIBELLES_TYPES[s.type]}</span>
                      </th>
                      <td>{s.valeur ?? <span className="muted">valeur en note de l’arrêté</span>}</td>
                      <td>
                        {[s.application, s.dateEffet && `à partir du ${fmt.date(s.dateEffet)}`].filter(Boolean).join(' ; ') || <span className="muted">–</span>}
                      </td>
                      <td>{s.ecart ?? <span className="muted">identique</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )
      })}
      <p className="source">
        Source :{' '}
        <a href={SOURCE_ARRETE.url} target="_blank" rel="noopener noreferrer">
          {SOURCE_ARRETE.titre}
        </a>
        , {SOURCE_ARRETE.version} ; relevé le {fmt.date(SOURCE_ARRETE.releve)}. Les codes et seuils de SISE-Eaux sont ceux des résultats publiés.
      </p>
    </div>
  )
}

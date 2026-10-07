"""Avis sanitaires de l'ARS dans le pipeline : tables DuckDB des conclusions classées (avis.lire), puis fichiers du
site (web/public/data/avis/). Le classificateur lui-même est dans avis.py."""
from __future__ import annotations

from .avis import LIBELLES, evoque, lire, sans_information

CODE = {"sensibles": 1, "ebullition": 2, "interdiction": 3}


def derniers_prelevements(con) -> None:
    """Crée depuis la vue plv_conclusions :

    avis_derniers(annee, cdreseau, dernier)   dernier prélèvement CONCLU de chaque réseau (une conclusion vide ne dit
                                              rien d'un avis)
    avis_arret(annee, arret)                  date d'arrêt des données : le prélèvement le plus récent, tous réseaux

    Choix de l'auteur (2026-09-25) : le site dit si le dernier prélèvement connu d'un réseau reprend encore un avis de
    l'année en cours ou ne le mentionne plus, et jusqu'à quelle date vont les données. L'ARS ne publie pas la levée
    d'une consigne : ce sont des faits datés, jamais un état « en vigueur ».
    """
    con.execute("""
        CREATE OR REPLACE TABLE avis_derniers AS
        SELECT annee, cdreseau, max(dateprel) AS dernier FROM plv_conclusions
        WHERE cdreseau IS NOT NULL AND cdreseau <> '' AND trim(coalesce(conclusionprel, '')) <> ''
        GROUP BY 1, 2""")
    con.execute("CREATE OR REPLACE TABLE avis_arret AS SELECT annee, max(dateprel) AS arret FROM plv_conclusions GROUP BY 1")


def charger(con, years: list[int]) -> None:
    """Classe les conclusions des prélèvements et crée six tables :

    avis_textes(id, texte, cat, local, causes)                 une ligne par formulation porteuse d'un avis
    avis_plv(referenceprel, annee, dateprel, cdreseau, id)     un prélèvement porteur d'un avis, par réseau
    avis_lecture(cddept, annee, conclusions, evoquant)         prélèvements conclus par chaque délégation de l'ARS, et
                                                               ceux dont la conclusion évoque une consigne (evoque)
    avis_muets(cddept, annee)                                  délégations sans information cette année-là
                                                               (sans_information) ; cddept au format SISE (« 038 »),
                                                               égal au préfixe du code de chacun de ses réseaux
    avis_derniers, avis_arret                                  voir derniers_prelevements
    Les conclusions sont lues dans les Parquet DIS déjà convertis (rapide, sans relancer l'étape 1).
    """
    import pandas as pd

    from . import dis

    sources = []
    for y in years:
        p = dis.parquet_paths(y)["plv"]
        if not p.exists():
            raise RuntimeError(f"{p} absent : relancer `robinet build -y {y} --force`")
        sources.append((y, p.as_posix()))
    union = " UNION ALL ".join(
        f"SELECT {y} AS annee, referenceprel, dateprel, cddept, cdreseau, conclusionprel FROM read_parquet('{p}')" for y, p in sources)
    con.execute(f"CREATE OR REPLACE TEMP VIEW plv_conclusions AS {union}")
    # Triées : un même corpus donne les mêmes numéros de texte d'une construction à l'autre (comparaisons possibles).
    textes = [r[0] for r in con.execute(
        "SELECT DISTINCT conclusionprel FROM plv_conclusions WHERE conclusionprel IS NOT NULL ORDER BY 1").fetchall()]
    lignes = []
    evoquant = []
    for t in textes:
        a = lire(t)
        if a.cat:
            lignes.append({"id": len(lignes), "texte": t, "cat": a.cat, "local": a.local, "causes": ",".join(a.causes)})
        # Un avis classé évoque toujours une consigne, même si un faux signal écarté par evoque() l'a porté.
        if a.cat or evoque(t):
            evoquant.append(t)
    df = pd.DataFrame(lignes, columns=["id", "texte", "cat", "local", "causes"])
    con.register("avis_textes_df", df)
    con.execute("CREATE OR REPLACE TABLE avis_textes AS SELECT * FROM avis_textes_df")
    con.unregister("avis_textes_df")
    con.execute("""
        CREATE OR REPLACE TABLE avis_plv AS
        SELECT DISTINCT p.referenceprel, p.annee, p.dateprel, p.cdreseau, t.id
        FROM plv_conclusions p JOIN avis_textes t ON p.conclusionprel = t.texte
        WHERE p.cdreseau IS NOT NULL AND p.cdreseau <> ''""")
    n = con.execute("SELECT count(DISTINCT referenceprel) FROM avis_plv").fetchone()[0]
    print(f"  avis ARS : {len(lignes):,} formulations porteuses d'un avis, {n:,} prélèvements")
    con.register("avis_evoquant_df", pd.DataFrame({"texte": evoquant}, columns=["texte"]))
    con.execute("""
        CREATE OR REPLACE TABLE avis_lecture AS
        SELECT p.cddept, p.annee, count(DISTINCT p.referenceprel) AS conclusions,
               count(DISTINCT p.referenceprel) FILTER (WHERE e.texte IS NOT NULL) AS evoquant
        FROM plv_conclusions p LEFT JOIN avis_evoquant_df e ON p.conclusionprel = e.texte
        WHERE p.cddept IS NOT NULL AND trim(coalesce(p.conclusionprel, '')) <> ''
        GROUP BY 1, 2""")
    con.unregister("avis_evoquant_df")
    muets = [(cd, int(a)) for cd, a, nc, ne in con.execute("SELECT * FROM avis_lecture ORDER BY 1, 2").fetchall()
             if sans_information(int(nc), int(ne))]
    con.execute("CREATE OR REPLACE TABLE avis_muets (cddept VARCHAR, annee INTEGER)")
    if muets:
        con.executemany("INSERT INTO avis_muets VALUES (?, ?)", muets)
    print(f"  délégations de l'ARS sans information de consigne : {len(muets)} (département × année)")
    derniers_prelevements(con)


def publier(con, years: list[int]) -> None:
    """avis/national.json (compteurs, causes, départements, lecture des délégations) et avis/<dd>.json (avis par
    commune, avec le texte, et lecture des délégations dont les réseaux desservent ses communes).

    lecture : {délégation: {année: [prélèvements conclus, dont la conclusion évoque une consigne]}}
    sans_information : {année: [délégations sans information (sans_information)]}
    arret : {année: date d'arrêt des données}
    derniers (avis/<dd>.json) : {année: {réseau: dernier prélèvement conclu}}, pour les réseaux porteurs d'un avis du
    fichier cette année-là (derniers_prelevements)
    Une délégation porte le code du département qu'elle suit, au format du site (« 38 », « 2B », « 974 »).
    """
    from collections import defaultdict

    from . import config as C
    from .util import dept_of_insee as _dept_of_insee
    from .util import dump as _dump
    from .situations import _dept

    # Prélèvement × commune : un avis sur un réseau vaut pour toutes les communes qu'il dessert cette année-là.
    con.execute("""
        CREATE OR REPLACE TEMP VIEW avis_com AS
        SELECT DISTINCT cu.inseecommune, a.referenceprel, a.annee, a.dateprel, a.cdreseau, a.id, t.cat, t.local, t.causes
        FROM avis_plv a JOIN avis_textes t USING (id) JOIN com_reseau cu USING (cdreseau, annee)""")
    nat: dict = {"libelles": LIBELLES, "annees": {}, "causes": {}, "depts": {}}
    for annee, cat, loc, nplv, nres, ncom in con.execute("""
            SELECT annee, cat, local, count(DISTINCT referenceprel), count(DISTINCT cdreseau), count(DISTINCT inseecommune)
            FROM avis_com GROUP BY 1, 2, 3""").fetchall():
        a = nat["annees"].setdefault(str(annee), {})
        cle = "local" if loc else cat
        cur = a.setdefault(cle, {"plv": 0, "reseaux": 0, "communes": 0})
        # « local » regroupe plusieurs catégories : sommer est une approximation acceptable (ce sont des bâtiments
        # ou points d'usage distincts) ; les catégories réseau, elles, ne sont jamais sommées entre elles.
        cur["plv"] += int(nplv)
        cur["reseaux"] += int(nres)
        cur["communes"] += int(ncom)
    # Communes touchées par au moins un avis réseau (hors avis locaux), toutes catégories : pour la part par département.
    for annee, n in con.execute("""
            SELECT annee, count(DISTINCT inseecommune) FROM avis_com WHERE NOT local GROUP BY 1""").fetchall():
        nat["annees"].setdefault(str(annee), {})["communes_toutes"] = int(n)
    for annee, cat, cs, n in con.execute("""
            SELECT a.annee, t.cat, t.causes, count(DISTINCT a.referenceprel)
            FROM avis_plv a JOIN avis_textes t USING (id) WHERE NOT t.local GROUP BY 1, 2, 3""").fetchall():
        d = nat["causes"].setdefault(str(annee), {}).setdefault(cat, {})
        for c in (cs.split(",") if cs else ["non précisée"]):
            d[c] = d.get(c, 0) + int(n)
    par_dept: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(set)))
    fiches: dict = defaultdict(lambda: {"textes": {}, "communes": defaultdict(list), "reseaux": set()})
    for insee, ref, annee, date, res, tid, cat, loc, cs in con.execute(
            "SELECT inseecommune, referenceprel, annee, dateprel, cdreseau, id, cat, local, causes FROM avis_com").fetchall():
        dd = _dept_of_insee(insee)
        if not loc:
            par_dept[dd][str(annee)][cat].add(insee)
        f = fiches[dd]
        f["textes"][str(tid)] = None
        f["communes"][insee].append([date, int(tid), res])
        f["reseaux"].add((str(annee), res))
    textes = {int(i): (t, c, bool(l), cs) for i, t, c, l, cs in con.execute(
        "SELECT id, texte, cat, local, causes FROM avis_textes").fetchall()}
    for dd, by_year in par_dept.items():
        nat["depts"][dd] = {a: {cat: len(s) for cat, s in cats.items()} | {"toutes": len(set().union(*cats.values()))}
                            for a, cats in by_year.items()}
    lecture: dict = defaultdict(dict)
    for cd, annee, nc, ne in con.execute("SELECT * FROM avis_lecture ORDER BY 1, 2").fetchall():
        lecture[_dept(cd, "")][str(annee)] = [int(nc), int(ne)]
    muets: dict = {str(y): [] for y in years}
    for cd, annee in con.execute("SELECT cddept, annee FROM avis_muets ORDER BY 1, 2").fetchall():
        muets.setdefault(str(annee), []).append(_dept(cd, ""))
    nat["lecture"] = dict(lecture)
    nat["sans_information"] = muets
    arret = {str(a): d for a, d in con.execute("SELECT annee, arret FROM avis_arret ORDER BY 1").fetchall()}
    nat["arret"] = arret
    _dump(C.WEB_DATA / "avis" / "national.json", nat)
    # Dernier prélèvement conclu des seuls réseaux porteurs d'un avis : ceux dont le site dit la suite.
    derniers = {(str(a), r): d for a, r, d in con.execute("""
        SELECT annee, cdreseau, dernier FROM avis_derniers JOIN (SELECT DISTINCT annee, cdreseau FROM avis_plv) USING (annee, cdreseau)
        """).fetchall()}
    # Délégations dont les réseaux desservent les communes de chaque fichier : la fiche juge chaque réseau selon la
    # délégation qui le suit (préfixe de son code), pas selon le département de la commune (14 communes par an).
    delegations: dict = defaultdict(set)
    for insee, cd in con.execute("SELECT DISTINCT inseecommune, substr(cdreseau, 1, 3) FROM com_reseau").fetchall():
        delegations[_dept_of_insee(insee)].add(_dept(cd, ""))
    # Un fichier par département, même vide : la fiche commune le charge toujours, et un 404 attendu serait
    # affiché comme une panne par les autres encarts en cours de chargement (components/Chargement.tsx).
    for dd in C.DEPARTEMENTS:
        fiches.setdefault(dd, {"textes": {}, "communes": {}})
    for dd, f in fiches.items():
        out = {"textes": {}, "communes": {}}
        for tid in f["textes"]:
            t, c, l, cs = textes[int(tid)]
            out["textes"][tid] = {"t": t, "c": c, "l": l, "k": cs.split(",") if cs else []}
        for insee, lst in f["communes"].items():
            out["communes"][insee] = sorted({tuple(x) for x in map(tuple, lst)}, reverse=True)
        ici = sorted(delegations[dd] | {dd})
        out["lecture"] = {d: lecture[d] for d in ici if d in lecture}
        out["sans_information"] = {a: [d for d in ds if d in ici] for a, ds in muets.items()}
        out["arret"] = arret
        ders: dict = defaultdict(dict)
        for a, r in sorted(f.get("reseaux", ())):
            if (a, r) in derniers:
                ders[a][r] = derniers[(a, r)]
        out["derniers"] = dict(ders)
        _dump(C.WEB_DATA / "avis" / f"{dd}.json", out)

"""Substances analysées sans limite ni référence de qualité : ce que la grille réglementaire n'encadre pas.

Un paramètre sans limite ne peut jamais être « en dépassement » : il est invisible dans toutes les vues du
site qui comptent des dépassements. Ce module les regroupe (perchlorate, TFA, métabolites de pesticides
sans limite, PFAS pris un par un, sous-produits de chloration…) et dit deux choses par millésime :
- combien on les cherche : réseaux et communes avec au moins une analyse (couverture) ;
- ce qu'on trouve : analyses quantifiées, réseaux et communes où la substance est quantifiée, maximum.

Les repères affichés ne sont PAS des limites de qualité. Ce sont uniquement des valeurs que les ARS
citent elles-mêmes dans les conclusions des prélèvements (DIS_PLV.conclusionprel), avec leur portée.
"""
from __future__ import annotations

import re

# Repères non réglementaires, tels que cités dans les conclusions des ARS (texte vérifié dans les données).
REPERES = {
    "6219": [  # perchlorate
        {"v": 4, "lib": "au-delà, pas de biberons pour les nourrissons de moins de 6 mois",
         "src": "recommandation DGS/Anses citée par les ARS"},
        {"v": 15, "lib": "au-delà, eau déconseillée aussi aux femmes enceintes et allaitantes",
         "src": "recommandation DGS/Anses citée par les ARS"},
    ],
}
REPERE_METABOLITES = {"v": 0.9, "lib": "« valeur de vigilance » des métabolites de pesticides sans limite",
                      "src": "citée par les ARS"}

GROUPES = {
    "perchlorate": "Perchlorate",
    "tfa": "TFA (acide trifluoroacétique)",
    "metabolites": "Métabolites de pesticides sans limite",
    "pfas": "PFAS pris un par un",
    "haloacetiques": "Acides haloacétiques (chloration)",
    "autres": "Autres composés organiques",
}
_METABOLITE = re.compile(r"\b(ESA|OXA|CGA|NOA)\b|m[ée]tabolite|\bR ?\d{6}\b", re.I)
_HALOACETIQUE = re.compile(r"^acide .*(chloro|bromo).*ac[ée]tique", re.I)


def groupe(code: str, info: dict) -> str | None:
    """Groupe d'un paramètre sans limite ni référence, ou None s'il n'entre dans aucun groupe suivi."""
    if info.get("lim") or info.get("ref"):
        return None
    lib = info.get("l") or ""
    if code == "6219":
        return "perchlorate"
    if code == "8858":
        return "tfa"
    if info.get("f") == "pfas":
        return "pfas"
    if _HALOACETIQUE.search(lib):
        return "haloacetiques"
    if info.get("f") == "physico_chimie" and _METABOLITE.search(lib):
        return "metabolites"
    if code == "1580" or info.get("f") == "organiques":
        return "autres"
    return None


def reperes(code: str, g: str) -> list[dict]:
    return REPERES.get(code) or ([REPERE_METABOLITES] if g == "metabolites" else [])


def build(con, years: list[int], params: dict) -> None:
    """horsgrille.json : par substance, par groupe et par département, couverture de recherche et résultats."""
    import pandas as pd

    from . import config as C
    from .build import _dept_of_insee, _dump, _n

    codes = {c: g for c, info in params.items() if (g := groupe(c, info))}
    df = pd.DataFrame({"code": list(codes), "groupe": list(codes.values())})
    con.register("hg_df", df)
    con.execute("CREATE OR REPLACE TEMP TABLE hg AS SELECT * FROM hg_df")
    con.unregister("hg_df")
    # Réseau × substance × année, puis rattachement aux communes desservies.
    con.execute("""
        CREATE OR REPLACE TEMP VIEW hg_res AS
        SELECT rp.cdreseau, rp.annee, rp.cdparametre AS code, h.groupe, rp.n, rp.n_quant, rp.vmax
        FROM reseau_param rp JOIN hg h ON rp.cdparametre = h.code""")
    con.execute("""
        CREATE OR REPLACE TEMP VIEW hg_com AS
        SELECT cu.inseecommune, r.annee, r.code, r.groupe, sum(r.n) AS n, sum(r.n_quant) AS nq, max(r.vmax) AS vmax
        FROM hg_res r JOIN com_reseau cu USING (cdreseau, annee) GROUP BY 1, 2, 3, 4""")

    out: dict = {"groupes": GROUPES, "annees": [str(y) for y in years], "substances": {}, "par_groupe": {}, "depts": {}}
    for code, annee, n, nq, nres, nres_q, vmax in con.execute("""
            SELECT code, annee, sum(n), sum(n_quant), count(DISTINCT cdreseau), count(DISTINCT cdreseau) FILTER (WHERE n_quant > 0), max(vmax)
            FROM hg_res GROUP BY 1, 2""").fetchall():
        info = params[code]
        s = out["substances"].setdefault(code, {"l": info["l"], "u": info.get("u"), "g": codes[code],
                                                "reperes": reperes(code, codes[code]), "annees": {}})
        s["annees"][str(annee)] = {"n": int(n), "nq": int(nq), "res": int(nres), "res_q": int(nres_q), "vmax": _n(vmax, 3)}
    for code, annee, ncom, ncom_q in con.execute("""
            SELECT code, annee, count(DISTINCT inseecommune), count(DISTINCT inseecommune) FILTER (WHERE nq > 0)
            FROM hg_com GROUP BY 1, 2""").fetchall():
        out["substances"][code]["annees"][str(annee)].update({"com": int(ncom), "com_q": int(ncom_q)})
    # Dépassements de repère : réseaux et communes dont le maximum de l'année dépasse chaque repère cité.
    for code, s in out["substances"].items():
        for r in s["reperes"]:
            for annee, nres, ncom in con.execute(f"""
                    SELECT r.annee, count(DISTINCT r.cdreseau), count(DISTINCT cu.inseecommune)
                    FROM hg_res r JOIN com_reseau cu USING (cdreseau, annee)
                    WHERE r.code = '{code}' AND r.vmax > {r['v']} GROUP BY 1""").fetchall():
                s["annees"][str(annee)].setdefault("au_dela", {})[str(r["v"])] = {"res": int(nres), "com": int(ncom)}
    # Par groupe : communes où au moins une substance du groupe est cherchée / quantifiée, et le total de communes.
    tot = dict(con.execute("SELECT annee, count(DISTINCT inseecommune) FROM com_reseau cu JOIN reseau_plv rp USING (cdreseau, annee) GROUP BY 1").fetchall())
    for g, annee, ncom, ncom_q, nsub in con.execute("""
            SELECT groupe, annee, count(DISTINCT inseecommune), count(DISTINCT inseecommune) FILTER (WHERE nq > 0),
                   count(DISTINCT code) FILTER (WHERE nq > 0)
            FROM hg_com GROUP BY 1, 2""").fetchall():
        out["par_groupe"].setdefault(g, {})[str(annee)] = {"com": int(ncom), "com_q": int(ncom_q), "subst_q": int(nsub),
                                                           "com_tot": int(tot.get(annee, 0))}
    # Par département et par groupe : [communes avec prélèvements, communes où cherché, communes où quantifié].
    dept_tot: dict = {}
    for insee, annee in con.execute("SELECT DISTINCT inseecommune, annee FROM com_reseau cu JOIN reseau_plv rp USING (cdreseau, annee)").fetchall():
        k = (_dept_of_insee(insee), str(annee))
        dept_tot[k] = dept_tot.get(k, 0) + 1
    agg: dict = {}
    for insee, annee, g, q in con.execute("SELECT inseecommune, annee, groupe, max(nq) > 0 FROM hg_com GROUP BY 1, 2, 3").fetchall():
        k = (g, _dept_of_insee(insee), str(annee))
        a = agg.setdefault(k, [0, 0])
        a[0] += 1
        a[1] += int(bool(q))
    for (g, dd, annee), (ch, qt) in agg.items():
        out["depts"].setdefault(g, {}).setdefault(annee, {})[dd] = [dept_tot.get((dd, annee), 0), ch, qt]
    _dump(C.WEB_DATA / "horsgrille.json", out)
    print(f"  hors grille : {len(codes)} substances suivies, {len(out['substances'])} analysées")

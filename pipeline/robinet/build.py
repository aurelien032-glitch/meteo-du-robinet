"""Construction du contrôle sanitaire → fichiers statiques du site (web/public/data/).

Étape 1, par millésime : agrégats (agregats.py, data/out/agg/<annee>/). Étape 2, tous millésimes confondus :
  meta.json, params.json, communes.json, national.json, map/<annee>.json, dept/<dd>.json, themes/<slug>.json,
  situations (situations.py), avis (avis.py), substances sans limite (horsgrille.py), séries mensuelles (series.py).
"""
from __future__ import annotations

import json
import time

import duckdb

from . import config as C
from . import avis_site, horsgrille, situations
from .util import arrondi as _n
from .util import dept_of_insee as _dept_of_insee
from .util import dept_site
from .util import dump as _dump
from .util import sql_modes
from .agregats import AGG, aggregate_year, connect
from .series import build_series
from .themes import FAMILIES, FAMILY_PRIORITY, KEY_PARAMS, THEMES


# ----------------------------------------------------------------------------------------------
# Étape 2 : fichiers du site
# ----------------------------------------------------------------------------------------------
def _views(con: duckdb.DuckDBPyConnection, years: list[int]) -> None:
    for name in ("reseau_param", "dept_param", "dept_famille", "reseau_plv", "reseau_info", "com_udi", "params", "params_lib",
                 "nat_month_param", "dept_month_param", "reseau_month_param"):
        present = [p.as_posix() for p in (AGG / str(y) / f"{name}.parquet" for y in years) if p.exists()]
        if present:
            con.execute(f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet({present!r}, union_by_name=true)")
    con.execute("CREATE OR REPLACE VIEW plv_all AS SELECT * FROM read_parquet("
                + repr([(AGG / str(y) / "plv.parquet").as_posix() for y in years]) + ", union_by_name=true)")
    # com_udi contient une ligne par (commune, quartier, réseau) : un même réseau peut desservir plusieurs
    # quartiers d'une commune. Joint tel quel à une table agrégée par (réseau, année), ce doublon multiplie les
    # sommes (prélèvements, dépassements) par le nombre de quartiers. com_reseau déduplique la clé de jointure.
    con.execute("CREATE OR REPLACE VIEW com_reseau AS SELECT DISTINCT inseecommune, cdreseau, annee FROM com_udi")


def build_params(con: duckdb.DuckDBPyConnection) -> dict:
    rows = con.execute(f"""
        SELECT p.cdparametre, arg_max(l.lib, l.annee), m.unite, m.limitequal, m.refqual,
               arg_min(p.famille, ({FAMILY_PRIORITY.replace('famille', 'p.famille')}, p.famille)),
               sum(p.n), sum(p.n_dep), sum(p.n_ref), sum(p.n_quant), list(DISTINCT p.annee ORDER BY p.annee)
        FROM params p JOIN params_lib l USING (cdparametre, annee)
        LEFT JOIN ({sql_modes("params_lib", "cdparametre", {"unite": "unite", "limitequal": "limitequal", "refqual": "refqual"})}) m
            USING (cdparametre)
        GROUP BY 1, 3, 4, 5 ORDER BY 7 DESC, 1""").fetchall()
    params = {}
    for code, lib, unite, lim, ref, fam, n, n_dep, n_ref, n_quant, annees in rows:
        params[code] = {"l": lib, "u": unite, "lim": lim, "ref": ref, "f": fam, "n": int(n), "nd": int(n_dep),
                        "nr": int(n_ref), "nq": int(n_quant), "a": annees, "k": KEY_PARAMS.get(code)}
    _dump(C.WEB_DATA / "params.json", {"familles": FAMILIES, "cles": KEY_PARAMS, "params": params})
    return params


def build_communes_index(con: duckdb.DuckDBPyConnection) -> list[dict]:
    rows = con.execute("""
        SELECT inseecommune, arg_max(nomcommune, (annee, nomcommune)) FROM com_udi GROUP BY 1 ORDER BY 1""").fetchall()
    names_file = C.OUT / "commune_names.json"
    names = json.loads(names_file.read_text(encoding="utf-8")) if names_file.exists() else {}
    index = [{"c": c, "n": names.get(c, n), "d": _dept_of_insee(c)} for c, n in rows]
    _dump(C.WEB_DATA / "communes.json", index)
    return index


def build_national(con: duckdb.DuckDBPyConnection, years: list[int]) -> None:
    out: dict = {"annees": {}, "depts": {}}
    plv_nat = con.execute("""
        SELECT annee, count(*), count(*) FILTER (WHERE c_bact = 'N'), count(*) FILTER (WHERE c_bact IN ('C','N')),
               count(*) FILTER (WHERE c_chim = 'N'), count(*) FILTER (WHERE c_chim IN ('C','N')),
               count(*) FILTER (WHERE r_bact = 'N'), count(*) FILTER (WHERE r_chim = 'N')
        FROM plv_all GROUP BY 1""").fetchall()
    fam_nat = con.execute("""
        SELECT annee, famille, sum(n), sum(n_dep), sum(n_ref), sum(n_quant) FROM dept_param GROUP BY 1, 2""").fetchall()
    # n_plv_dep (prelevements en depassement) a part : dept_famille compte les referenceprel distincts par
    # famille, un prelevement en depassement sur deux parametres d'une meme famille n'y compte qu'une fois.
    fam_nat_npd = con.execute("SELECT annee, famille, sum(n_plv_dep) FROM dept_famille GROUP BY 1, 2").fetchall()
    res_dep = con.execute("""
        SELECT annee, famille, count(DISTINCT cdreseau) FILTER (WHERE n_dep > 0), count(DISTINCT cdreseau)
        FROM reseau_param GROUP BY 1, 2""").fetchall()
    top = con.execute("""
        SELECT annee, cdparametre, sum(n), sum(n_dep), sum(n_quant), sum(n_plv_dep) FROM dept_param
        GROUP BY 1, 2 QUALIFY row_number() OVER (PARTITION BY annee ORDER BY sum(n_dep) DESC, cdparametre) <= 20
        ORDER BY 1, 4 DESC, 2""").fetchall()
    counts = con.execute("""
        SELECT annee, count(DISTINCT inseecommune), count(DISTINCT cdreseau) FROM com_udi GROUP BY 1""").fetchall()
    for y in years:
        out["annees"][y] = {"fam": {}, "top": [], "plv": {}, "n_communes": 0, "n_reseaux": 0}
    for annee, n_c, n_r in counts:
        out["annees"].setdefault(annee, {"fam": {}, "top": [], "plv": {}})
        out["annees"][annee]["n_communes"], out["annees"][annee]["n_reseaux"] = n_c, n_r
    for annee, n, ncb, neb, ncc, nec, nrb, nrc in plv_nat:
        if annee in out["annees"]:
            out["annees"][annee]["plv"] = {"n": n, "nc_bact": ncb, "ne_bact": neb, "nc_chim": ncc, "ne_chim": nec,
                                           "nr_bact": nrb, "nr_chim": nrc}
    for annee, fam, n, nd, nr, nq in fam_nat:
        if annee in out["annees"]:
            out["annees"][annee]["fam"][fam] = {"n": int(n), "nd": int(nd), "nr": int(nr), "nq": int(nq), "npd": 0}
    for annee, fam, npd in fam_nat_npd:
        if annee in out["annees"] and fam in out["annees"][annee]["fam"]:
            out["annees"][annee]["fam"][fam]["npd"] = int(npd)
    for annee, fam, nrd, nrt in res_dep:
        if annee in out["annees"] and fam in out["annees"][annee]["fam"]:
            out["annees"][annee]["fam"][fam].update({"res_dep": nrd, "res_tot": nrt})
    for annee, code, n, nd, nq, npd in top:
        if annee in out["annees"]:
            out["annees"][annee]["top"].append({"p": code, "n": int(n), "nd": int(nd), "nq": int(nq), "npd": int(npd)})

    dept_plv = con.execute("""
        SELECT cddept, annee, count(*), count(*) FILTER (WHERE c_bact = 'N'), count(*) FILTER (WHERE c_bact IN ('C','N')),
               count(*) FILTER (WHERE c_chim = 'N'), count(*) FILTER (WHERE c_chim IN ('C','N'))
        FROM plv_all GROUP BY 1, 2""").fetchall()
    dept_fam = con.execute("""
        SELECT cddept, annee, famille, sum(n), sum(n_dep), sum(n_quant) FROM dept_param GROUP BY 1, 2, 3""").fetchall()
    dept_fam_npd = con.execute("SELECT cddept, annee, famille, n_plv_dep FROM dept_famille").fetchall()
    dept_res = con.execute("""
        SELECT ri.cddept, rp.annee, rp.famille, count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_dep > 0), count(DISTINCT rp.cdreseau)
        FROM reseau_param rp JOIN reseau_info ri USING (cdreseau, annee) GROUP BY 1, 2, 3""").fetchall()
    for dept, annee, n, ncb, neb, ncc, nec in dept_plv:
        d = out["depts"].setdefault(dept, {})
        d[annee] = {"plv": {"n": n, "nc_bact": ncb, "ne_bact": neb, "nc_chim": ncc, "ne_chim": nec}, "fam": {}}
    for dept, annee, fam, n, nd, nq in dept_fam:
        d = out["depts"].get(dept, {}).get(annee)
        if d is not None:
            d["fam"][fam] = {"n": int(n), "nd": int(nd), "nq": int(nq), "npd": 0}
    for dept, annee, fam, npd in dept_fam_npd:
        d = out["depts"].get(dept, {}).get(annee)
        if d is not None and fam in d["fam"]:
            d["fam"][fam]["npd"] = int(npd)
    for dept, annee, fam, nrd, nrt in dept_res:
        d = out["depts"].get(dept, {}).get(annee)
        if d is not None and fam in d["fam"]:
            d["fam"][fam].update({"res_dep": nrd, "res_tot": nrt})
    _dump(C.WEB_DATA / "national.json", out)


def build_maps(con: duckdb.DuckDBPyConnection, years: list[int], situ: dict[int, dict[str, str]] | None = None) -> None:
    """Par commune et par année : compteurs compacts pour colorer la carte.

    Ordre des valeurs : [n_plv, nc_bact, ne_bact, nc_chim, ne_chim, nd_pesticides, nd_azote, nd_pfas, nd_microbio,
    nd_metaux, nd_total, vmax_nitrates, vmax_total_pesticides, n_reseaux, avis_ars, situations]

    avis_ars : avis sanitaire le plus grave de l'année sur un réseau desservant la commune, hors avis limités à un
    bâtiment ou un point d'usage (0 aucun, 1 déconseillée aux publics sensibles, 2 ébullition, 3 restriction pour tous) ;
    null sans avis quand un de ses réseaux relève d'une délégation de l'ARS sans information cette année-là
    (avis.sans_information) : « pas d'information », pas « aucun avis ».

    situations : situation la plus défavorable, par famille, des réseaux qui desservent la commune, à la manière
    des bilans du ministère (situations.py) : une chaîne d'un chiffre par famille dans l'ordre situations.FAMILLES.
    """
    for y in years:
        plv = con.execute(f"""
            SELECT cu.inseecommune, sum(rp.n_plv), sum(rp.nc_bact), sum(rp.ne_bact), sum(rp.nc_chim), sum(rp.ne_chim),
                   count(DISTINCT cu.cdreseau)
            FROM com_reseau cu JOIN reseau_plv rp USING (cdreseau, annee) WHERE cu.annee = {y} GROUP BY 1""").fetchall()
        fam = con.execute(f"""
            SELECT cu.inseecommune, rp.famille, sum(rp.n_dep)
            FROM com_reseau cu JOIN reseau_param rp USING (cdreseau, annee) WHERE cu.annee = {y} GROUP BY 1, 2""").fetchall()
        key = con.execute(f"""
            SELECT cu.inseecommune, rp.cdparametre, max(rp.vmax)
            FROM com_reseau cu JOIN reseau_param rp USING (cdreseau, annee)
            WHERE cu.annee = {y} AND rp.cdparametre IN ('1340', '6276') GROUP BY 1, 2""").fetchall()
        m: dict[str, list] = {}
        for insee, n, ncb, neb, ncc, nec, nres in plv:
            m[insee] = [int(n), int(ncb), int(neb), int(ncc), int(nec), 0, 0, 0, 0, 0, 0, None, None, int(nres), 0]
        idx = {"pesticides": 5, "azote": 6, "pfas": 7, "microbio": 8, "metaux_mineraux": 9}
        for insee, f, nd in fam:
            row = m.get(insee)
            if row is None:
                continue
            nd = int(nd)
            row[10] += nd
            if f in idx:
                row[idx[f]] += nd
        for insee, code, vmax in key:
            row = m.get(insee)
            if row is not None:
                row[11 if code == "1340" else 12] = _n(vmax, 3)
        codes = " ".join(f"WHEN '{c}' THEN {v}" for c, v in avis_site.CODE.items())
        for insee, code in con.execute(f"""
                SELECT cu.inseecommune, max(CASE t.cat {codes} END)
                FROM com_reseau cu JOIN avis_plv a USING (cdreseau, annee) JOIN avis_textes t USING (id)
                WHERE cu.annee = {y} AND NOT t.local GROUP BY 1""").fetchall():
            row = m.get(insee)
            if row is not None:
                row[14] = int(code)
        for (insee,) in con.execute(f"""
                SELECT DISTINCT cu.inseecommune FROM com_reseau cu
                JOIN avis_muets am ON am.cddept = substr(cu.cdreseau, 1, 3) AND am.annee = cu.annee
                WHERE cu.annee = {y}""").fetchall():
            row = m.get(insee)
            if row is not None and row[14] == 0:
                row[14] = None
        if situ and y in situ:
            sit = situations.pire_par_commune(con, y, situ[y])
            vide = "-" * len(situations.FAMILLES)
            for insee, row in m.items():
                row.append(sit.get(insee, vide))
        _dump(C.WEB_DATA / "map" / f"{y}.json", m)


def build_depts(con: duckdb.DuckDBPyConnection, years: list[int], params: dict) -> None:
    depts = [r[0] for r in con.execute("SELECT DISTINCT cddept FROM reseau_info ORDER BY 1").fetchall()]
    key_codes = tuple(KEY_PARAMS)
    for dept in depts:
        dd = dept_site(dept)
        reseaux = con.execute(f"""
            SELECT ri.cdreseau, arg_max(ri.distributeur, ri.annee), arg_max(ri.uge, ri.annee),
                   (SELECT arg_max(nomreseau, (annee, nomreseau)) FROM com_udi cu WHERE cu.cdreseau = ri.cdreseau),
                   (SELECT list(DISTINCT inseecommune ORDER BY inseecommune) FROM com_udi cu WHERE cu.cdreseau = ri.cdreseau)
            FROM reseau_info ri WHERE ri.cddept = '{dept}' GROUP BY 1""").fetchall()
        res_ids = [r[0] for r in reseaux]
        if not res_ids:
            continue
        ids = repr(res_ids)
        com_res = con.execute(f"""
            SELECT inseecommune, arg_max(nomcommune, (annee, nomcommune)), annee, list(DISTINCT cdreseau ORDER BY cdreseau)
            FROM com_udi WHERE cdreseau IN (SELECT unnest({ids})) GROUP BY 1, 3""").fetchall()
        communes_set = sorted({r[0] for r in com_res})
        com_list = repr(communes_set)
        plv = con.execute(f"""
            SELECT cu.inseecommune, cu.annee, sum(rp.n_plv), sum(rp.nc_bact), sum(rp.ne_bact), sum(rp.nc_chim), sum(rp.ne_chim),
                   sum(rp.nr_bact), sum(rp.nr_chim)
            FROM com_reseau cu JOIN reseau_plv rp USING (cdreseau, annee)
            WHERE cu.inseecommune IN (SELECT unnest({com_list})) GROUP BY 1, 2""").fetchall()
        fam = con.execute(f"""
            SELECT cu.inseecommune, cu.annee, rp.famille, sum(rp.n), sum(rp.n_dep), sum(rp.n_ref), sum(rp.n_quant)
            FROM com_reseau cu JOIN reseau_param rp USING (cdreseau, annee)
            WHERE cu.inseecommune IN (SELECT unnest({com_list})) GROUP BY 1, 2, 3""").fetchall()
        # Moyenne pondérée par n_val (analyses avec une valeur numérique exploitable), pas par n (toutes les
        # analyses de la ligne) : pour des paramètres surtout organoleptiques (saveur, odeur…), valtraduite
        # est NULL sur la grande majorité des lignes (TRY_CAST échoue sur un résultat texte), et pondérer par
        # n diluait la moyenne d'un facteur pouvant dépasser 10 en incluant des réseaux sans aucune valeur.
        detail = con.execute(f"""
            SELECT cu.inseecommune, cu.annee, rp.cdparametre, sum(rp.n), sum(rp.n_dep), sum(rp.n_ref), sum(rp.n_quant),
                   max(rp.vmax), CAST(sum(CAST(rp.vmean * rp.n_val AS DECIMAL(38,10))) AS DOUBLE) / nullif(sum(rp.n_val), 0), arg_max(rp.vlast, (rp.dlast, rp.vlast)), max(rp.dlast)
            FROM com_reseau cu JOIN reseau_param rp USING (cdreseau, annee)
            WHERE cu.inseecommune IN (SELECT unnest({com_list})) AND (rp.n_dep > 0 OR rp.cdparametre IN {key_codes})
            GROUP BY 1, 2, 3""").fetchall()
        # Statistiques par réseau (page réseau) : même forme que les statistiques par commune.
        res_plv = con.execute(f"""
            SELECT cdreseau, annee, n_plv, nc_bact, ne_bact, nc_chim, ne_chim, nr_bact, nr_chim
            FROM reseau_plv WHERE cdreseau IN (SELECT unnest({ids}))""").fetchall()
        res_fam = con.execute(f"""
            SELECT cdreseau, annee, famille, sum(n), sum(n_dep), sum(n_ref), sum(n_quant)
            FROM reseau_param WHERE cdreseau IN (SELECT unnest({ids})) GROUP BY 1, 2, 3""").fetchall()
        res_det = con.execute(f"""
            SELECT cdreseau, annee, cdparametre, n, n_dep, n_ref, n_quant, vmax, vmean, vlast, dlast
            FROM reseau_param WHERE cdreseau IN (SELECT unnest({ids})) AND (n_dep > 0 OR cdparametre IN {key_codes})""").fetchall()
        out = {"dept": dd, "annees": years, "reseaux": {}, "communes": {}}
        for code, dist, uge, nom, communes in reseaux:
            out["reseaux"][code] = {"nom": nom, "dist": dist, "uge": uge, "communes": communes or [], "stats": {}}
        for code, annee, n, ncb, neb, ncc, nec, nrb, nrc in res_plv:
            r = out["reseaux"].get(code)
            if r is not None:
                r["stats"][annee] = {"plv": [int(n), int(ncb), int(neb), int(ncc), int(nec), int(nrb), int(nrc)], "fam": {}, "cle": {}, "dep": []}
        for code, annee, f, n, nd, nr, nq in res_fam:
            s = out["reseaux"].get(code, {}).get("stats", {}).get(annee)
            if s is not None:
                s["fam"][f] = [int(n), int(nd), int(nr), int(nq)]
        for code, annee, p, n, nd, nr, nq, vmax, vmean, vlast, dlast in res_det:
            s = out["reseaux"].get(code, {}).get("stats", {}).get(annee)
            if s is None:
                continue
            rec = [int(n), int(nd), int(nr), int(nq), _n(vmax), _n(vmean), _n(vlast), dlast]
            if p in KEY_PARAMS:
                s["cle"][p] = rec
            if nd > 0:
                s["dep"].append([p] + rec)
        for r in out["reseaux"].values():
            for s in r["stats"].values():
                s["dep"].sort(key=lambda x: (-x[2], x[0]))
        for insee, nom, annee, res in com_res:
            c = out["communes"].setdefault(insee, {"nom": nom, "reseaux": {}, "stats": {}})
            c["nom"] = nom
            c["reseaux"][annee] = res
        for insee, annee, n, ncb, neb, ncc, nec, nrb, nrc in plv:
            c = out["communes"].get(insee)
            if c is None:
                continue
            c["stats"][annee] = {"plv": [int(n), int(ncb), int(neb), int(ncc), int(nec), int(nrb), int(nrc)],
                                 "fam": {}, "cle": {}, "dep": []}
        for insee, annee, f, n, nd, nr, nq in fam:
            s = out["communes"].get(insee, {}).get("stats", {}).get(annee)
            if s is not None:
                s["fam"][f] = [int(n), int(nd), int(nr), int(nq)]
        for insee, annee, code, n, nd, nr, nq, vmax, vmean, vlast, dlast in detail:
            s = out["communes"].get(insee, {}).get("stats", {}).get(annee)
            if s is None:
                continue
            rec = [int(n), int(nd), int(nr), int(nq), _n(vmax), _n(vmean), _n(vlast), dlast]
            if code in KEY_PARAMS:
                s["cle"][code] = rec
            if nd > 0:
                s["dep"].append([code] + rec)
        # Substances sans limite ni référence (horsgrille.py) : celles quantifiées, plus le perchlorate et le TFA
        # même non quantifiés (« recherché, non détecté » se distingue alors de « jamais recherché ») ; et par
        # groupe, le nombre de substances recherchées et quantifiées.
        hgc = con.execute(f"""
            SELECT cu.inseecommune, cu.annee, rp.cdparametre, h.groupe, sum(rp.n), sum(rp.n_quant), max(rp.vmax)
            FROM com_reseau cu JOIN reseau_param rp USING (cdreseau, annee) JOIN hg h ON rp.cdparametre = h.code
            WHERE cu.inseecommune IN (SELECT unnest({com_list})) GROUP BY 1, 2, 3, 4""").fetchall()
        for insee, annee, code, g, n, nq, vmax in hgc:
            s = out["communes"].get(insee, {}).get("stats", {}).get(annee)
            if s is None:
                continue
            h = s.setdefault("hg", {"s": [], "g": {}})
            cnt = h["g"].setdefault(g, [0, 0])
            cnt[0] += 1
            cnt[1] += int(nq > 0)
            if nq > 0 or code in ("6219", "8858"):
                h["s"].append([code, int(n), int(nq), _n(vmax)])
        # Mêmes substances par réseau : la fiche « Mon eau » suit le réseau choisi (2026-10-05).
        hgr = con.execute(f"""
            SELECT rp.cdreseau, rp.annee, rp.cdparametre, h.groupe, sum(rp.n), sum(rp.n_quant), max(rp.vmax)
            FROM reseau_param rp JOIN hg h ON rp.cdparametre = h.code
            WHERE rp.cdreseau IN (SELECT unnest({ids})) GROUP BY 1, 2, 3, 4""").fetchall()
        for code_r, annee, code, g, n, nq, vmax in hgr:
            s = out["reseaux"].get(code_r, {}).get("stats", {}).get(annee)
            if s is None:
                continue
            h = s.setdefault("hg", {"s": [], "g": {}})
            cnt = h["g"].setdefault(g, [0, 0])
            cnt[0] += 1
            cnt[1] += int(nq > 0)
            if nq > 0 or code in ("6219", "8858"):
                h["s"].append([code, int(n), int(nq), _n(vmax)])
        for c in [*out["communes"].values(), *out["reseaux"].values()]:
            for s in c["stats"].values():
                s["dep"].sort(key=lambda r: (-r[2], r[0]))
                if "hg" in s:
                    s["hg"]["s"].sort(key=lambda r: (-(r[3] or 0), r[0]))
        _dump(C.WEB_DATA / "dept" / f"{dd}.json", out)


def build_themes(con: duckdb.DuckDBPyConnection, years: list[int], params: dict) -> None:
    # Dernière année complète pour le classement des réseaux les plus touchés : l'année en cours (« partiel »,
    # cf. run()) n'a pas encore reçu ses prélèvements de fin d'année, un classement par dépassements cumulés
    # y favoriserait mécaniquement les réseaux contrôlés tôt dans l'année et se remanierait à chaque rebuild.
    completes = [a for a in years if a < int(time.strftime("%Y"))]
    annee_ref = max(completes) if completes else max(years)
    for th in THEMES:
        fam, key = th["famille"], th["param_cle"]
        nat = con.execute(f"""
            SELECT annee, sum(n), sum(n_dep), sum(n_ref), sum(n_quant) FROM dept_param
            WHERE famille = '{fam}' GROUP BY 1 ORDER BY 1""").fetchall()
        nat_npd = dict(con.execute(f"""
            SELECT annee, sum(n_plv_dep) FROM dept_famille WHERE famille = '{fam}' GROUP BY 1""").fetchall())
        # Dépassements de RÉFÉRENCE de qualité (« nr », « res_ref ») à côté de ceux de limite : la radioactivité n'a que
        # des références, et son thème comptait des limites, donc zéro chaque année (choix de l'auteur, 24/09).
        res = con.execute(f"""
            SELECT rp.annee, count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_dep > 0), count(DISTINCT rp.cdreseau),
                   count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_ref > 0)
            FROM reseau_param rp JOIN com_udi cu USING (cdreseau, annee) WHERE rp.famille = '{fam}' GROUP BY 1""").fetchall()
        depts = con.execute(f"""
            SELECT ri.cddept, rp.annee, sum(rp.n), sum(rp.n_dep), sum(rp.n_quant),
                   count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_dep > 0), count(DISTINCT rp.cdreseau),
                   sum(rp.n_ref), count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_ref > 0)
            FROM reseau_param rp JOIN reseau_info ri USING (cdreseau, annee) WHERE rp.famille = '{fam}' GROUP BY 1, 2""").fetchall()
        top_params = con.execute(f"""
            SELECT cdparametre, sum(n), sum(n_dep), sum(n_quant), sum(n_plv_dep), sum(n_ref) FROM dept_param
            WHERE famille = '{fam}' GROUP BY 1 ORDER BY 3 DESC, 6 DESC, 4 DESC, 1 LIMIT 25""").fetchall()
        top_res = con.execute(f"""
            SELECT rp.cdreseau, ri.cddept, ri.distributeur, sum(rp.n_dep), sum(rp.n), max(rp.vmax) FILTER (WHERE rp.cdparametre = '{key}'),
                   (SELECT arg_max(nomreseau, (annee, nomreseau)) FROM com_udi cu WHERE cu.cdreseau = rp.cdreseau),
                   (SELECT count(DISTINCT inseecommune) FROM com_udi cu WHERE cu.cdreseau = rp.cdreseau),
                   sum(rp.n_ref)
            FROM reseau_param rp JOIN reseau_info ri USING (cdreseau, annee)
            WHERE rp.famille = '{fam}' AND rp.annee = {annee_ref} GROUP BY 1, 2, 3 ORDER BY 4 DESC, 9 DESC, 1 LIMIT 40""").fetchall()
        key_dist = con.execute(f"""
            SELECT annee, count(*), quantile_cont(vmax, 0.5), quantile_cont(vmax, 0.9), max(vmax), count(*) FILTER (WHERE n_dep > 0)
            FROM reseau_param WHERE cdparametre = '{key}' GROUP BY 1 ORDER BY 1""").fetchall()
        out = {
            "slug": th["slug"], "titre": th["titre"], "question": th["question"], "famille": fam, "param_cle": key,
            "national": {a: {"n": int(n), "nd": int(nd), "nr": int(nr), "nq": int(nq), "npd": int(nat_npd.get(a, 0))} for a, n, nd, nr, nq in nat},
            "params": [{"p": p, "l": params.get(p, {}).get("l"), "n": int(n), "nd": int(nd), "nq": int(nq), "npd": int(npd), "nr": int(nr)}
                       for p, n, nd, nq, npd, nr in top_params],
            "depts": {},
            "top_reseaux": [{"r": r, "d": d, "dist": dist, "nd": int(nd), "n": int(n), "vmax": _n(v), "nom": nom, "nc": nc, "nr": int(nr or 0)}
                            for r, d, dist, nd, n, v, nom, nc, nr in top_res],
            "cle": {a: {"n_res": n, "p50": _n(p50), "p90": _n(p90), "max": _n(mx), "res_dep": nd} for a, n, p50, p90, mx, nd in key_dist},
        }
        for a, nrd, nrt, nrr in res:
            if a in out["national"]:
                out["national"][a].update({"res_dep": nrd, "res_tot": nrt, "res_ref": nrr})
        for dept, a, n, nd, nq, nrd, nrt, nr, nrr in depts:
            out["depts"].setdefault(dept, {})[a] = {"n": int(n), "nd": int(nd), "nq": int(nq), "res_dep": nrd, "res_tot": nrt,
                                                    "nr": int(nr or 0), "res_ref": nrr}
        _dump(C.WEB_DATA / "themes" / f"{th['slug']}.json", out)


def run(years: list[int], *, force: bool = False) -> None:
    t0 = time.time()
    con = connect()
    available = [y for y in years if (C.RAW / "dis" / f"dis-{y}.zip").exists()]
    missing = sorted(set(years) - set(available))
    if missing:
        print(f"  ! millésimes sans archive DIS, ignorés : {missing}")
    if not available:
        # Janvier : l'archive de l'année nouvelle n'est pas encore publiée. Sans ce garde, l'étape 2 réécrivait les
        # fichiers du site sans aucun millésime (meta.json « annees »: []) ou échouait en route.
        print("  ! aucun millésime disponible : rien n'est reconstruit, les fichiers du site restent en l'état")
        return
    print("Étape 1 : agrégats par millésime")
    for y in available:
        aggregate_year(con, y, force=force)
    print("Étape 2 : fichiers du site")
    # Les contours et les noms de communes viennent de `robinet geo` (étape à part du rafraîchissement) ; ici seulement
    # s'ils manquent, faute de quoi l'index des communes retomberait sur les noms en capitales du contrôle sanitaire.
    if not (C.OUT / "commune_names.json").exists() and (C.RAW / "geo" / "communes-100m.geojson").exists():
        from . import geo
        geo.run()
    _views(con, available)
    avis_site.charger(con, available)
    codes = situations.build(con, available)
    params = build_params(con)
    horsgrille.build(con, available, params)
    build_communes_index(con)
    build_national(con, available)
    build_maps(con, available, codes)
    build_depts(con, available, params)
    build_themes(con, available, params)
    build_series(con, available, params)
    avis_site.publier(con, available)
    _dump(C.WEB_DATA / "meta.json", {"annees": available, "construit_le": time.strftime("%Y-%m-%d %H:%M"),
                                     # le millésime de l'année en cours est publié au fil de l'eau : partiel
                                     "partiel": [y for y in available if y >= int(time.strftime("%Y"))],
                                     "themes": [{"slug": t["slug"], "titre": t["titre"], "question": t["question"]}
                                                for t in THEMES]})
    print(f"Terminé en {time.time() - t0:.0f}s")

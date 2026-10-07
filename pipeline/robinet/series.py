"""Séries mensuelles du site : par paramètre (national, départements ; series/<code>.json) et par réseau
(series/reseaux/<année>/<dd>.json, fiches commune et réseau)."""
from __future__ import annotations

import duckdb

from . import config as C
from .agregats import AGG
from .themes import FAMILIES, KEY_PARAMS
from .util import arrondi as _n
from .util import dept_site
from .util import dump as _dump

# Familles du détail « Mois par mois » : tous leurs paramètres quantifiés dans l'année sont publiés. Pour les autres
# familles, seuls les paramètres au-dessus de leur limite (séries sous le bulletin).
SERIES_DETAIL = ("pesticides", "azote", "pfas")
# Paramètre par défaut de chaque graphique du détail, publié dès qu'il est analysé, même jamais quantifié :
# total des pesticides, nitrates, somme des 20 PFAS.
SERIES_DEFAUT = ("6276", "1340", "8847")


def build_series(con: duckdb.DuckDBPyConnection, years: list[int], params: dict) -> None:
    """Séries mensuelles des paramètres clés : national (avec quantiles) et par département (dépassements)."""
    # Produit par aggregate_year (étape 1) pour chaque année de `years` : s'il manque, l'étape 1 n'a pas
    # tourné pour cette année ou s'est arrêtée avant de la marquer complète (aggregate_year(...).complete) —
    # une incohérence interne à signaler fort plutôt qu'un site publié avec des séries mensuelles absentes.
    if not (AGG / str(years[0]) / "nat_month_param.parquet").exists():
        raise RuntimeError(f"séries mensuelles absentes pour {years[0]} : relancer `robinet build --force`")
    # Paramètres clés, métabolites vedettes, puis les substances le plus souvent au-dessus d'une limite :
    # ce sont celles que l'on veut choisir sur la carte et dans les séries mensuelles.
    codes = list(KEY_PARAMS) + ["6378", "6379", "7717", "1108"]
    top = sorted((c for c in params if params[c]["nd"] > 0 and c not in codes), key=lambda c: -params[c]["nd"])
    codes += top[:40]
    mois = [f"{y}-{m:02d}" for y in years for m in range(1, 13)]
    idx = {k: i for i, k in enumerate(mois)}
    index = []
    for code in codes:
        info = params.get(code)
        if not info:
            continue
        index.append({"code": code, "l": info["l"], "u": info["u"], "f": info["f"], "lim": info["lim"], "ref": info["ref"], "k": info.get("k"), "nd": info["nd"]})
        nat = {k: [None] * len(mois) for k in ("n", "nd", "nq", "npd", "moy", "p50", "p90", "max")}
        for a, m, n, nd, nq, vmean, p50, p90, vmax, npd in con.execute(f"""
                SELECT annee, mois, n, n_dep, n_quant, vmean, p50, p90, vmax, n_plv_dep FROM nat_month_param
                WHERE cdparametre = '{code}' ORDER BY 1, 2""").fetchall():
            i = idx.get(f"{a}-{m:02d}")
            if i is None:
                continue
            nat["n"][i], nat["nd"][i], nat["nq"][i], nat["npd"][i] = int(n), int(nd), int(nq), int(npd)
            nat["moy"][i], nat["p50"][i], nat["p90"][i], nat["max"][i] = _n(vmean), _n(p50), _n(p90), _n(vmax)
        depts: dict[str, dict] = {}
        for dept, a, m, n, nd, nq, vmax in con.execute(f"""
                SELECT cddept, annee, mois, n, n_dep, n_quant, vmax FROM dept_month_param
                WHERE cdparametre = '{code}' ORDER BY 1, 2, 3""").fetchall():
            i = idx.get(f"{a}-{m:02d}")
            if i is None:
                continue
            d = depts.setdefault(dept, {"n": [0] * len(mois), "nd": [0] * len(mois), "nq": [0] * len(mois), "max": [None] * len(mois)})
            d["n"][i], d["nd"][i], d["nq"][i], d["max"][i] = int(n), int(nd), int(nq), _n(vmax)
        _dump(C.WEB_DATA / "series" / f"{code}.json",
              {"code": code, "l": info["l"], "u": info["u"], "lim": info["lim"], "ref": info["ref"], "mois": mois,
               "national": nat, "depts": depts})
    # Index des séries disponibles, pour les sélecteurs de paramètre du site (famille puis libellé).
    index.sort(key=lambda e: (list(FAMILIES).index(e["f"]) if e["f"] in FAMILIES else 99, e["l"] or ""))
    _dump(C.WEB_DATA / "series" / "index.json", index)
    build_series_reseaux(con, years)


def _sig(x):
    """Quatre chiffres significatifs (NaN → null) : un PFAS isolé se mesure au millième de µg/L, l'arrondi à trois
    décimales de _n l'écrirait 0."""
    if x is None or x != x:
        return None
    return float(f"{x:.4g}")


def series_publiees(con: duckdb.DuckDBPyConnection, year: int) -> list[tuple]:
    """Mois publiés d'un millésime, (département, réseau, paramètre, mois, analyses, dépassements, maximum), triés.

    Sont publiés, pour chaque réseau : tout paramètre au-dessus de sa limite dans l'année (séries sous le bulletin,
    une par famille en cause) ; dans les familles du détail (SERIES_DETAIL), tout paramètre quantifié au moins une
    fois dans l'année, et le paramètre par défaut de chaque graphique (SERIES_DEFAUT) dès qu'il est analysé.
    Seuls les mois avec au moins une analyse sont écrits."""
    return con.execute(f"""
        WITH annee AS (SELECT * FROM reseau_month_param WHERE annee = {int(year)}),
        retenus AS (
            SELECT cdreseau, cdparametre FROM annee GROUP BY 1, 2
            HAVING sum(n_dep) > 0
                OR (any_value(famille) IN {SERIES_DETAIL} AND (sum(n_quant) > 0 OR cdparametre IN {SERIES_DEFAUT})))
        SELECT ri.cddept, a.cdreseau, a.cdparametre, a.mois, a.n, a.n_dep, a.vmax
        FROM annee a JOIN retenus USING (cdreseau, cdparametre) JOIN reseau_info ri USING (cdreseau, annee)
        WHERE a.n > 0 ORDER BY 1, 2, 3, 4""").fetchall()


def build_series_reseaux(con: duckdb.DuckDBPyConnection, years: list[int]) -> None:
    """Séries mensuelles par réseau, un fichier par millésime et par département (series/reseaux/<année>/<dd>.json) :
    {annee, reseaux: {réseau: {paramètre: [[mois 1-12, analyses, dépassements, maximum], …]}}}, mois sans analyse
    omis. Un fichier par année : une fiche ne charge que l'année affichée."""
    import shutil
    if not (AGG / str(years[0]) / "reseau_month_param.parquet").exists():
        raise RuntimeError(f"séries par réseau absentes pour {years[0]} : relancer `robinet build --force`")
    racine = C.WEB_DATA / "series" / "reseaux"
    # Ancien format (un fichier par département, toutes années, cinq paramètres) et millésimes retirés.
    shutil.rmtree(C.WEB_DATA / "series" / "dept", ignore_errors=True)
    shutil.rmtree(racine, ignore_errors=True)
    total, fichiers = 0, 0
    for y in years:
        by_dept: dict[str, dict] = {}
        for dept, code, p, m, n, nd, vmax in series_publiees(con, y):
            dd = dept_site(dept)
            by_dept.setdefault(dd, {}).setdefault(code, {}).setdefault(p, []).append([int(m), int(n), int(nd), _sig(vmax)])
        for dd, reseaux in by_dept.items():
            path = racine / str(y) / f"{dd}.json"
            _dump(path, {"annee": y, "reseaux": reseaux}, silencieux=True)
            total += path.stat().st_size
            fichiers += 1
    print(f"  → series/reseaux : {fichiers} fichiers, {total / 1e6:.1f} Mo")

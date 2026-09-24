"""Construction des agrégats du contrôle sanitaire → fichiers statiques du site (web/public/data/).

Étape 1, par millésime (résultats persistés dans data/out/agg/<annee>/, rejouée seulement si absente) :
  plv.parquet            un prélèvement = une ligne (le fichier DIS_PLV en contient une par réseau desservi)
  plv_reseau.parquet     lien prélèvement ↔ réseau (un prélèvement peut couvrir plusieurs réseaux)
  reseau_param.parquet   par réseau × paramètre : analyses, dépassements, max, moyenne, dernière valeur
  dept_param.parquet     par département × paramètre
  reseau_plv.parquet     par réseau : prélèvements et conformités
  reseau_info.parquet    nom, distributeur, département de chaque réseau
  com_udi.parquet        communes ↔ réseaux du millésime
  params.parquet         catalogue des paramètres du millésime

Étape 2, tous millésimes confondus → web/public/data/ :
  meta.json, params.json, communes.json, national.json, map/<annee>.json, dept/<dd>.json, themes/<slug>.json
"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import duckdb

from . import config as C
from . import avis, dis, horsgrille, situations
from .themes import FAMILIES, FAMILY_CASE, FAMILY_PRIORITY, KEY_PARAMS, THEMES

AGG = C.OUT / "agg"
NUM_RE = r"([0-9]+(?:[,.][0-9]+)?)"
# Paramètres suivis mois par mois au niveau de chaque réseau : nitrates, total pesticides, PFAS, E. coli, entérocoques
RESEAU_SERIES = ("1340", "6276", "8847", "1449", "6455")


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"  → {path.relative_to(C.ROOT).as_posix()} ({path.stat().st_size / 1e3:.0f} ko)")


def _n(x, d: int = 3):
    """Arrondi JSON-compatible (NaN → null)."""
    if x is None:
        return None
    if isinstance(x, float):
        if x != x:
            return None
        return round(x, d)
    return x


def _dept_of_insee(insee: str) -> str:
    if insee.startswith("977") or insee.startswith("978"):
        return "971"
    if insee.startswith("97") or insee.startswith("98"):
        return insee[:3]
    return insee[:2]


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    tmp = C.CACHE / "duckdb_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    con.execute("SET memory_limit='8GB'")
    con.execute(f"SET temp_directory='{tmp.as_posix()}'")
    con.execute("SET preserve_insertion_order=false")
    return con


# ----------------------------------------------------------------------------------------------
# Étape 1 : agrégats d'un millésime
# ----------------------------------------------------------------------------------------------
def _bound(col: str, op: str) -> str:
    """Borne numérique d'un seuil SISE-Eaux : « <=0,1 µg/L » → 0.1 ; « >=6,5 et <=9 unité pH » → 6.5 / 9."""
    return f"TRY_CAST(replace(regexp_extract({col}, '{op}\\s*{NUM_RE}', 1), ',', '.') AS DOUBLE)"


def aggregate_year(con: duckdb.DuckDBPyConnection, year: int, *, force: bool = False) -> None:
    out = AGG / str(year)
    # Sentinelle dédiée, écrite en tout dernier (après les 11 COPY qui suivent) plutôt que l'existence d'un
    # fichier intermédiaire quelconque : un run interrompu en cours de route (Ctrl-C, mise en veille, tâche
    # planifiée tuée) laissait alors un répertoire d'année incomplet ou tronqué que le run suivant prenait
    # pour un agrégat valide et ne retentait jamais.
    if (out / ".complete").exists() and not force:
        print(f"  = agrégats {year} présents")
        return
    paths = dis.to_parquet(year)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    plv, result, com_udi = paths["plv"].as_posix(), paths["result"].as_posix(), paths["com_udi"].as_posix()

    con.execute(f"""
        CREATE OR REPLACE TABLE plv AS
        SELECT referenceprel,
               any_value(cddept) AS cddept,
               any_value(inseecommuneprinc) AS insee_princ,
               any_value(dateprel) AS dateprel,
               CAST(substr(any_value(dateprel), 1, 4) AS INTEGER) AS annee,
               any_value(ugelib) AS uge, any_value(distrlib) AS distributeur, any_value(moalib) AS moa,
               any_value(plvconformitebacterio) AS c_bact, any_value(plvconformitechimique) AS c_chim,
               any_value(plvconformitereferencebact) AS r_bact, any_value(plvconformitereferencechim) AS r_chim
        FROM read_parquet('{plv}') GROUP BY referenceprel""")
    con.execute(f"""
        CREATE OR REPLACE TABLE plv_reseau AS
        SELECT DISTINCT referenceprel, cdreseau FROM read_parquet('{plv}')
        WHERE cdreseau IS NOT NULL AND cdreseau <> ''""")

    con.execute(f"""
        CREATE OR REPLACE TABLE res AS
        WITH r0 AS (
            SELECT r.referenceprel, r.cdparametre, r.valtraduite AS val,
                   {FAMILY_CASE} AS famille,
                   {_bound('r.limitequal', '<=')} AS lim_max, {_bound('r.limitequal', '>=')} AS lim_min,
                   {_bound('r.refqual', '<=')} AS ref_max, {_bound('r.refqual', '>=')} AS ref_min,
                   p.annee, p.dateprel, p.cddept
            FROM read_parquet('{result}') r JOIN plv p USING (referenceprel))
        SELECT *,
               coalesce((lim_max IS NOT NULL AND val > lim_max) OR (lim_min IS NOT NULL AND val < lim_min), false) AS dep_lim,
               coalesce((ref_max IS NOT NULL AND val > ref_max) OR (ref_min IS NOT NULL AND val < ref_min), false) AS dep_ref
        FROM r0""")
    # Famille décidée par paramètre (la plus spécifique observée dans l'année), pas par ligne : sinon un paramètre
    # dont la limite disparaît en cours d'année change de famille au hasard d'une construction à l'autre.
    con.execute(f"""
        CREATE OR REPLACE TABLE fam AS
        SELECT cdparametre, arg_min(famille, {FAMILY_PRIORITY}) AS famille FROM res GROUP BY 1""")
    con.execute("CREATE OR REPLACE TABLE res2 AS SELECT r.* EXCLUDE (famille), f.famille FROM res r JOIN fam f USING (cdparametre)")
    con.execute("DROP TABLE res")
    con.execute("ALTER TABLE res2 RENAME TO res")
    print(f"  {year}: analyses enrichies en {time.time() - t0:.0f}s")

    con.execute(f"""
        COPY (SELECT pr.cdreseau, r.annee, r.cdparametre, any_value(r.famille) AS famille,
                     count(*) AS n, count(*) FILTER (WHERE r.dep_lim) AS n_dep, count(*) FILTER (WHERE r.dep_ref) AS n_ref,
                     count(*) FILTER (WHERE r.val > 0) AS n_quant, count(r.val) AS n_val,
                     max(r.val) AS vmax, avg(r.val) AS vmean, arg_max(r.val, r.dateprel) AS vlast, max(r.dateprel) AS dlast
              FROM res r JOIN plv_reseau pr USING (referenceprel)
              GROUP BY 1, 2, 3)
        TO '{(out / 'reseau_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT cddept, annee, cdparametre, any_value(famille) AS famille,
                     count(*) AS n, count(*) FILTER (WHERE dep_lim) AS n_dep, count(*) FILTER (WHERE dep_ref) AS n_ref,
                     count(*) FILTER (WHERE val > 0) AS n_quant, max(val) AS vmax,
                     count(DISTINCT referenceprel) FILTER (WHERE dep_lim) AS n_plv_dep
              FROM res GROUP BY 1, 2, 3)
        TO '{(out / 'dept_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    # Prélèvements en dépassement, à la maille famille : count(DISTINCT referenceprel) n'est valable que sur son
    # propre GROUP BY. Sommer dept_param.n_plv_dep (compté par paramètre) sur plusieurs paramètres d'une même
    # famille compterait plusieurs fois un prélèvement en dépassement sur plus d'un paramètre de cette famille.
    con.execute(f"""
        COPY (SELECT cddept, annee, famille, count(DISTINCT referenceprel) FILTER (WHERE dep_lim) AS n_plv_dep
              FROM res GROUP BY 1, 2, 3)
        TO '{(out / 'dept_famille.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT pr.cdreseau, p.annee, count(*) AS n_plv,
                     count(*) FILTER (WHERE c_bact = 'N') AS nc_bact, count(*) FILTER (WHERE c_bact IN ('C', 'N')) AS ne_bact,
                     count(*) FILTER (WHERE c_chim = 'N') AS nc_chim, count(*) FILTER (WHERE c_chim IN ('C', 'N')) AS ne_chim,
                     count(*) FILTER (WHERE r_bact = 'N') AS nr_bact, count(*) FILTER (WHERE r_chim = 'N') AS nr_chim
              FROM plv p JOIN plv_reseau pr USING (referenceprel) GROUP BY 1, 2)
        TO '{(out / 'reseau_plv.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT pr.cdreseau, mode(p.cddept) AS cddept, mode(p.distributeur) AS distributeur, mode(p.uge) AS uge,
                     mode(p.moa) AS moa, {year} AS annee
              FROM plv p JOIN plv_reseau pr USING (referenceprel) GROUP BY 1)
        TO '{(out / 'reseau_info.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT inseecommune, nomcommune, quartier, cdreseau, nomreseau, debutalim, {year} AS annee
              FROM read_parquet('{com_udi}'))
        TO '{(out / 'com_udi.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT r.cdparametre, any_value(r.libminparametre) AS lib, mode(r.cdunitereferencesiseeaux) AS unite,
                     mode(nullif(r.limitequal, '')) AS limitequal, mode(nullif(r.refqual, '')) AS refqual,
                     mode(r.casparam) AS cas, {year} AS annee
              FROM read_parquet('{result}') r GROUP BY 1)
        TO '{(out / 'params_lib.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT cdparametre, any_value(famille) AS famille, annee, count(*) AS n,
                     count(*) FILTER (WHERE dep_lim) AS n_dep, count(*) FILTER (WHERE dep_ref) AS n_ref,
                     count(*) FILTER (WHERE val > 0) AS n_quant, max(val) AS vmax
              FROM res GROUP BY 1, 3)
        TO '{(out / 'params.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    # Séries mensuelles (animations vidéo) : par paramètre, national avec quantiles, et par département.
    con.execute(f"""
        COPY (SELECT annee, CAST(substr(dateprel, 6, 2) AS INTEGER) AS mois, cdparametre, any_value(famille) AS famille,
                     count(*) AS n, count(*) FILTER (WHERE dep_lim) AS n_dep, count(*) FILTER (WHERE val > 0) AS n_quant,
                     avg(val) AS vmean, quantile_cont(val, 0.5) AS p50, quantile_cont(val, 0.9) AS p90, max(val) AS vmax,
                     count(DISTINCT referenceprel) FILTER (WHERE dep_lim) AS n_plv_dep
              FROM res GROUP BY 1, 2, 3)
        TO '{(out / 'nat_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT cddept, annee, CAST(substr(dateprel, 6, 2) AS INTEGER) AS mois, cdparametre,
                     count(*) AS n, count(*) FILTER (WHERE dep_lim) AS n_dep, count(*) FILTER (WHERE val > 0) AS n_quant,
                     avg(val) AS vmean, max(val) AS vmax
              FROM res GROUP BY 1, 2, 3, 4)
        TO '{(out / 'dept_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    # Séries mensuelles par réseau pour quelques paramètres phares (animations « votre robinet mois par mois »).
    con.execute(f"""
        COPY (SELECT pr.cdreseau, r.annee, CAST(substr(r.dateprel, 6, 2) AS INTEGER) AS mois, r.cdparametre,
                     count(*) AS n, count(*) FILTER (WHERE r.dep_lim) AS n_dep, count(*) FILTER (WHERE r.val > 0) AS n_quant,
                     max(r.val) AS vmax
              FROM res r JOIN plv_reseau pr USING (referenceprel)
              WHERE r.cdparametre IN {tuple(RESEAU_SERIES)} GROUP BY 1, 2, 3, 4)
        TO '{(out / 'reseau_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute("DROP TABLE res")
    (out / ".complete").write_text(time.strftime("%Y-%m-%dT%H:%M:%S"), encoding="utf-8")
    print(f"  {year}: agrégats écrits en {time.time() - t0:.0f}s")


# ----------------------------------------------------------------------------------------------
# Étape 2 : fichiers du site
# ----------------------------------------------------------------------------------------------
def _views(con: duckdb.DuckDBPyConnection, years: list[int]) -> None:
    def files(name: str) -> str:
        return repr([(AGG / str(y) / f"{name}.parquet").as_posix() for y in years])
    for name in ("reseau_param", "dept_param", "dept_famille", "reseau_plv", "reseau_info", "com_udi", "params", "params_lib",
                 "nat_month_param", "dept_month_param", "reseau_month_param"):
        present = [f for f in eval(files(name)) if Path(f).exists()]
        if present:
            con.execute(f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet({present!r}, union_by_name=true)")
    con.execute("CREATE OR REPLACE VIEW plv_all AS SELECT * FROM read_parquet("
                + repr([(AGG / str(y) / "plv.parquet").as_posix() for y in years]) + ", union_by_name=true)")
    # com_udi contient une ligne par (commune, quartier, réseau) : un même réseau peut desservir plusieurs
    # quartiers d'une commune. Joint tel quel à une table agrégée par (réseau, année), ce doublon multiplie les
    # sommes (prélèvements, dépassements) par le nombre de quartiers. com_reseau déduplique la clé de jointure.
    con.execute("CREATE OR REPLACE VIEW com_reseau AS SELECT DISTINCT inseecommune, cdreseau, annee FROM com_udi")


def _persist_plv(con: duckdb.DuckDBPyConnection, years: list[int]) -> None:
    """Étape 1 ne garde pas la table plv : on la ré-exporte ici depuis les Parquet DIS (rapide)."""
    for y in years:
        dest = AGG / str(y) / "plv.parquet"
        if dest.exists():
            continue
        plv = dis.parquet_paths(y)["plv"].as_posix()
        con.execute(f"""
            COPY (SELECT referenceprel, any_value(cddept) AS cddept, any_value(inseecommuneprinc) AS insee_princ,
                         any_value(dateprel) AS dateprel, CAST(substr(any_value(dateprel), 1, 4) AS INTEGER) AS annee,
                         any_value(plvconformitebacterio) AS c_bact, any_value(plvconformitechimique) AS c_chim,
                         any_value(plvconformitereferencebact) AS r_bact, any_value(plvconformitereferencechim) AS r_chim
                  FROM read_parquet('{plv}') GROUP BY referenceprel)
            TO '{dest.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")


def build_params(con: duckdb.DuckDBPyConnection) -> dict:
    rows = con.execute(f"""
        SELECT p.cdparametre, any_value(l.lib), mode(l.unite), mode(l.limitequal), mode(l.refqual),
               arg_min(p.famille, {FAMILY_PRIORITY.replace('famille', 'p.famille')}),
               sum(p.n), sum(p.n_dep), sum(p.n_ref), sum(p.n_quant), list(DISTINCT p.annee ORDER BY p.annee)
        FROM params p JOIN params_lib l USING (cdparametre, annee)
        GROUP BY 1 ORDER BY 7 DESC""").fetchall()
    params = {}
    for code, lib, unite, lim, ref, fam, n, n_dep, n_ref, n_quant, annees in rows:
        params[code] = {"l": lib, "u": unite, "lim": lim, "ref": ref, "f": fam, "n": int(n), "nd": int(n_dep),
                        "nr": int(n_ref), "nq": int(n_quant), "a": annees, "k": KEY_PARAMS.get(code)}
    _dump(C.WEB_DATA / "params.json", {"familles": FAMILIES, "cles": KEY_PARAMS, "params": params})
    return params


def build_communes_index(con: duckdb.DuckDBPyConnection) -> list[dict]:
    rows = con.execute("""
        SELECT inseecommune, arg_max(nomcommune, annee) FROM com_udi GROUP BY 1 ORDER BY 1""").fetchall()
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
    com_dep = con.execute("""
        SELECT rp.annee, rp.famille, count(DISTINCT cu.inseecommune) FILTER (WHERE rp.n_dep > 0), count(DISTINCT cu.inseecommune)
        FROM reseau_param rp JOIN com_reseau cu USING (cdreseau, annee) GROUP BY 1, 2""").fetchall()
    top = con.execute("""
        SELECT annee, cdparametre, sum(n), sum(n_dep), sum(n_quant), sum(n_plv_dep) FROM dept_param
        GROUP BY 1, 2 QUALIFY row_number() OVER (PARTITION BY annee ORDER BY sum(n_dep) DESC) <= 20""").fetchall()
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
    for annee, fam, ncd, nct in com_dep:
        if annee in out["annees"] and fam in out["annees"][annee]["fam"]:
            out["annees"][annee]["fam"][fam].update({"com_dep": ncd, "com_tot": nct})
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
        codes = " ".join(f"WHEN '{c}' THEN {v}" for c, v in avis.CODE.items())
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
        dd = dept[1:] if len(dept) == 3 and dept.startswith("0") else dept
        reseaux = con.execute(f"""
            SELECT ri.cdreseau, arg_max(ri.distributeur, ri.annee), arg_max(ri.uge, ri.annee),
                   (SELECT arg_max(nomreseau, annee) FROM com_udi cu WHERE cu.cdreseau = ri.cdreseau),
                   (SELECT list(DISTINCT inseecommune ORDER BY inseecommune) FROM com_udi cu WHERE cu.cdreseau = ri.cdreseau)
            FROM reseau_info ri WHERE ri.cddept = '{dept}' GROUP BY 1""").fetchall()
        res_ids = [r[0] for r in reseaux]
        if not res_ids:
            continue
        ids = repr(res_ids)
        com_res = con.execute(f"""
            SELECT inseecommune, arg_max(nomcommune, annee), annee, list(DISTINCT cdreseau ORDER BY cdreseau)
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
                   max(rp.vmax), sum(rp.vmean * rp.n_val) / nullif(sum(rp.n_val), 0), arg_max(rp.vlast, rp.dlast), max(rp.dlast)
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
                s["dep"].sort(key=lambda x: -x[2])
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
        for c in out["communes"].values():
            for s in c["stats"].values():
                s["dep"].sort(key=lambda r: -r[2])
                if "hg" in s:
                    s["hg"]["s"].sort(key=lambda r: (-(r[3] or 0)))
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
        res = con.execute(f"""
            SELECT rp.annee, count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_dep > 0), count(DISTINCT rp.cdreseau),
                   count(DISTINCT cu.inseecommune) FILTER (WHERE rp.n_dep > 0), count(DISTINCT cu.inseecommune)
            FROM reseau_param rp JOIN com_udi cu USING (cdreseau, annee) WHERE rp.famille = '{fam}' GROUP BY 1""").fetchall()
        depts = con.execute(f"""
            SELECT ri.cddept, rp.annee, sum(rp.n), sum(rp.n_dep), sum(rp.n_quant),
                   count(DISTINCT rp.cdreseau) FILTER (WHERE rp.n_dep > 0), count(DISTINCT rp.cdreseau)
            FROM reseau_param rp JOIN reseau_info ri USING (cdreseau, annee) WHERE rp.famille = '{fam}' GROUP BY 1, 2""").fetchall()
        top_params = con.execute(f"""
            SELECT cdparametre, sum(n), sum(n_dep), sum(n_quant), sum(n_plv_dep) FROM dept_param
            WHERE famille = '{fam}' GROUP BY 1 ORDER BY 3 DESC, 4 DESC LIMIT 25""").fetchall()
        top_res = con.execute(f"""
            SELECT rp.cdreseau, ri.cddept, ri.distributeur, sum(rp.n_dep), sum(rp.n), max(rp.vmax) FILTER (WHERE rp.cdparametre = '{key}'),
                   (SELECT arg_max(nomreseau, annee) FROM com_udi cu WHERE cu.cdreseau = rp.cdreseau),
                   (SELECT count(DISTINCT inseecommune) FROM com_udi cu WHERE cu.cdreseau = rp.cdreseau)
            FROM reseau_param rp JOIN reseau_info ri USING (cdreseau, annee)
            WHERE rp.famille = '{fam}' AND rp.annee = {annee_ref} GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 40""").fetchall()
        key_dist = con.execute(f"""
            SELECT annee, count(*), quantile_cont(vmax, 0.5), quantile_cont(vmax, 0.9), max(vmax), count(*) FILTER (WHERE n_dep > 0)
            FROM reseau_param WHERE cdparametre = '{key}' GROUP BY 1 ORDER BY 1""").fetchall()
        out = {
            "slug": th["slug"], "titre": th["titre"], "question": th["question"], "famille": fam, "param_cle": key,
            "national": {a: {"n": int(n), "nd": int(nd), "nr": int(nr), "nq": int(nq), "npd": int(nat_npd.get(a, 0))} for a, n, nd, nr, nq in nat},
            "params": [{"p": p, "l": params.get(p, {}).get("l"), "n": int(n), "nd": int(nd), "nq": int(nq), "npd": int(npd)}
                       for p, n, nd, nq, npd in top_params],
            "depts": {},
            "top_reseaux": [{"r": r, "d": d, "dist": dist, "nd": int(nd), "n": int(n), "vmax": _n(v), "nom": nom, "nc": nc}
                            for r, d, dist, nd, n, v, nom, nc in top_res],
            "cle": {a: {"n_res": n, "p50": _n(p50), "p90": _n(p90), "max": _n(mx), "res_dep": nd} for a, n, p50, p90, mx, nd in key_dist},
        }
        for a, nrd, nrt, ncd, nct in res:
            if a in out["national"]:
                out["national"][a].update({"res_dep": nrd, "res_tot": nrt, "com_dep": ncd, "com_tot": nct})
        for dept, a, n, nd, nq, nrd, nrt in depts:
            out["depts"].setdefault(dept, {})[a] = {"n": int(n), "nd": int(nd), "nq": int(nq), "res_dep": nrd, "res_tot": nrt}
        _dump(C.WEB_DATA / "themes" / f"{th['slug']}.json", out)


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
    build_series_reseaux(con, years, mois)


def build_series_reseaux(con: duckdb.DuckDBPyConnection, years: list[int], mois: list[str]) -> None:
    """Séries mensuelles par réseau, un fichier par département : {réseau: {paramètre: {n, nd, nq, max}}}."""
    if not (AGG / str(years[0]) / "reseau_month_param.parquet").exists():
        raise RuntimeError(f"séries par réseau absentes pour {years[0]} : relancer `robinet build --force`")
    idx = {k: i for i, k in enumerate(mois)}
    rows = con.execute("""
        SELECT ri.cddept, m.cdreseau, m.annee, m.mois, m.cdparametre, m.n, m.n_dep, m.n_quant, m.vmax
        FROM reseau_month_param m JOIN reseau_info ri USING (cdreseau, annee) ORDER BY 1, 2""").fetchall()
    by_dept: dict[str, dict] = {}
    for dept, code, a, m, p, n, nd, nq, vmax in rows:
        i = idx.get(f"{a}-{m:02d}")
        if i is None:
            continue
        dd = dept[1:] if len(dept) == 3 and dept.startswith("0") else dept
        d = by_dept.setdefault(dd, {}).setdefault(code, {}).setdefault(
            p, {"n": [0] * len(mois), "nd": [0] * len(mois), "nq": [0] * len(mois), "max": [None] * len(mois)})
        d["n"][i], d["nd"][i], d["nq"][i], d["max"][i] = int(n), int(nd), int(nq), _n(vmax)
    for dd, reseaux in by_dept.items():
        _dump(C.WEB_DATA / "series" / "dept" / f"{dd}.json", {"mois": mois, "params": list(RESEAU_SERIES), "reseaux": reseaux})


def build_sitemap() -> None:
    """sitemap.xml et robots.txt pour que les fiches commune existent aux yeux des moteurs de recherche."""
    import os
    base = os.environ.get("SITE_URL", "https://VOTRE-COMPTE.github.io/robinet-dataviz").rstrip("/")
    urls = ["/", "/carte", "/themes", "/services", "/amont", "/secheresse", "/methode"]
    meta = json.loads((C.WEB_DATA / "meta.json").read_text(encoding="utf-8")) if (C.WEB_DATA / "meta.json").exists() else {}
    urls += [f"/themes/{t['slug']}" for t in meta.get("themes", [])]
    urls += [f"/departement/{d if not (len(d) == 3 and d.startswith('0')) else d[1:]}" for d in C.DEPARTEMENTS]
    communes = json.loads((C.WEB_DATA / "communes.json").read_text(encoding="utf-8")) if (C.WEB_DATA / "communes.json").exists() else []
    urls += [f"/commune/{c['c']}" for c in communes]
    body = "\n".join(f"  <url><loc>{base}{u}</loc></url>" for u in urls)
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'
    (C.WEB_DATA.parent / "sitemap.xml").write_text(xml, encoding="utf-8")
    (C.WEB_DATA.parent / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n", encoding="utf-8")
    print(f"  → web/public/sitemap.xml ({len(urls)} adresses, base {base})")


def run(years: list[int], *, force: bool = False) -> None:
    t0 = time.time()
    con = connect()
    available = [y for y in years if (C.RAW / "dis" / f"dis-{y}.zip").exists()]
    missing = sorted(set(years) - set(available))
    if missing:
        print(f"  ! millésimes sans archive DIS, ignorés : {missing}")
    print("Étape 1 : agrégats par millésime")
    for y in available:
        aggregate_year(con, y, force=force)
    _persist_plv(con, available)
    print("Étape 2 : fichiers du site")
    if (C.RAW / "geo" / "communes-100m.geojson").exists():
        from . import geo
        geo.run()
    _views(con, available)
    avis.charger(con, available)
    codes = situations.build(con, available)
    params = build_params(con)
    horsgrille.build(con, available, params)
    build_communes_index(con)
    build_national(con, available)
    build_maps(con, available, codes)
    build_depts(con, available, params)
    build_themes(con, available, params)
    build_series(con, available, params)
    avis.publier(con, available)
    build_sitemap()
    _dump(C.WEB_DATA / "meta.json", {"annees": available, "construit_le": time.strftime("%Y-%m-%d %H:%M"),
                                     # le millésime de l'année en cours est publié au fil de l'eau : partiel
                                     "partiel": [y for y in available if y >= int(time.strftime("%Y"))],
                                     "themes": [{"slug": t["slug"], "titre": t["titre"], "question": t["question"]}
                                                for t in THEMES]})
    print(f"Terminé en {time.time() - t0:.0f}s")

"""L'amont du robinet : prélèvements (BNPE), ventes de pesticides (BNV-D), nappes (ADES) → fichiers du site.

Sorties :
  amont/national.json    par année et par département : volumes prélevés pour l'eau potable, part souterraine,
                         kilos de substances vendues, état des nappes (nitrates, pesticides), croisement avec le robinet
  amont/dept/<dd>.json   ouvrages de prélèvement et points de suivi des nappes d'un département, par commune
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import duckdb

from . import config as C

RESEAU_AEP_BRUTES = "0000000028"  # réseau national de suivi des eaux brutes utilisées pour l'eau potable


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    print(f"  → {path.relative_to(C.ROOT).as_posix()} ({path.stat().st_size / 1e3:.0f} ko)")


def _n(x, d: int = 2):
    if x is None:
        return None
    if isinstance(x, float):
        return None if x != x else round(x, d)
    return x


def _glob(sub: str) -> str | None:
    files = sorted((C.CACHE / sub).glob("*.json"))
    files = [f for f in files if f.stat().st_size > 2]  # ignore les listes vides « [] »
    return repr([f.as_posix() for f in files]) if files else None


def run() -> None:
    t0 = time.time()
    con = duckdb.connect()
    out: dict = {"bnpe": {}, "bnvd": {}, "ades": {}, "croisement": {}}
    depts: dict[str, dict] = {}

    # --- BNPE : volumes prélevés pour l'eau potable ------------------------------------------------
    chro, ouv = _glob("bnpe_aep"), _glob("bnpe_ouvrages")
    if chro and ouv:
        con.execute(f"CREATE VIEW chro AS SELECT * FROM read_json_auto({chro}, union_by_name=true, maximum_object_size=67108864)")
        con.execute(f"CREATE VIEW ouv AS SELECT * FROM read_json_auto({ouv}, union_by_name=true, maximum_object_size=67108864)")
        # Quelques ouvrages ont deux déclarations pour la même année (229 cas sur 318 000) : on garde la plus grande.
        con.execute("""
            CREATE TABLE prel AS
            WITH c AS (
                SELECT code_ouvrage, annee, max(volume) AS volume, any_value(code_commune_insee) AS code_commune_insee,
                       any_value(code_departement) AS code_departement, any_value(nom_commune) AS nom_commune,
                       any_value(nom_ouvrage) AS nom_ouvrage_c, any_value(longitude) AS longitude, any_value(latitude) AS latitude
                FROM chro WHERE volume IS NOT NULL AND volume > 0 GROUP BY 1, 2)
            SELECT c.code_ouvrage, c.annee, c.volume, c.code_commune_insee, c.code_departement, c.nom_commune,
                   coalesce(o.code_type_milieu, 'INC') AS milieu, coalesce(o.nom_ouvrage, c.nom_ouvrage_c) AS nom_ouvrage,
                   c.longitude, c.latitude
            FROM c LEFT JOIN (SELECT DISTINCT ON (code_ouvrage) * FROM ouv) o USING (code_ouvrage)""")
        nat = con.execute("""
            SELECT annee, sum(volume), sum(volume) FILTER (WHERE milieu = 'SOUT'), sum(volume) FILTER (WHERE milieu = 'CONT'),
                   count(DISTINCT code_ouvrage), count(DISTINCT code_departement)
            FROM prel GROUP BY 1 ORDER BY 1""").fetchall()
        out["bnpe"]["annees"] = {a: {"volume": _n(v, 0), "sout": _n(s, 0), "cont": _n(sup, 0), "n_ouvrages": n, "n_depts": nd}
                                 for a, v, s, sup, n, nd in nat}
        # dernier millésime raisonnablement complet : au moins 90 départements renseignés
        complete = [a for a, v in out["bnpe"]["annees"].items() if v["n_depts"] >= 90]
        ref = max(complete) if complete else max(out["bnpe"]["annees"])
        out["bnpe"]["annee_ref"] = ref
        for dep, v, s, n, top in con.execute(f"""
                SELECT code_departement, sum(volume), sum(volume) FILTER (WHERE milieu = 'SOUT'), count(DISTINCT code_ouvrage),
                       (SELECT list(struct_pack(nom := nom_ouvrage, commune := code_commune_insee, volume := volume, milieu := milieu))
                        FROM (SELECT * FROM prel p2 WHERE p2.code_departement = p.code_departement AND p2.annee = {ref}
                              ORDER BY volume DESC LIMIT 5))
                FROM prel p WHERE annee = {ref} GROUP BY 1""").fetchall():
            out["bnpe"].setdefault("depts", {})[dep] = {"volume": _n(v, 0), "part_sout": _n((s or 0) / v, 3) if v else None,
                                                        "n_ouvrages": n, "top": top}
        for dep, insee, code, nom, milieu, lon, lat, vols in con.execute("""
                SELECT code_departement, code_commune_insee, code_ouvrage, any_value(nom_ouvrage), any_value(milieu),
                       any_value(longitude), any_value(latitude),
                       map_from_entries(list(struct_pack(k := CAST(annee AS VARCHAR), v := volume) ORDER BY annee))
                FROM prel WHERE annee >= 2012 GROUP BY 1, 2, 3""").fetchall():
            d = depts.setdefault(dep, {"ouvrages": {}, "nappes": {}})
            d["ouvrages"][code] = {"nom": nom, "commune": insee, "milieu": milieu, "lon": _n(lon, 4), "lat": _n(lat, 4),
                                   "volumes": {k: _n(v, 0) for k, v in vols.items()}}
        print(f"  BNPE : {len(out['bnpe']['annees'])} années, référence {ref}")

    # --- BNV-D : ventes de substances -------------------------------------------------------------
    bnvd = _glob("bnvd")
    if bnvd:
        con.execute(f"CREATE VIEW ventes AS SELECT * FROM read_json_auto({bnvd}, union_by_name=true)")
        out["bnvd"]["annees"] = {}
        for a, q, herb, fong, ins, nd in con.execute("""
                SELECT annee, sum(quantite), sum(quantite) FILTER (WHERE fonction ILIKE 'herbicide%'),
                       sum(quantite) FILTER (WHERE fonction ILIKE 'fongicide%'), sum(quantite) FILTER (WHERE fonction ILIKE 'insecticide%'),
                       count(DISTINCT code_departement)
                FROM ventes GROUP BY 1 ORDER BY 1""").fetchall():
            out["bnvd"]["annees"][a] = {"kg": _n(q, 0), "herbicides": _n(herb, 0), "fongicides": _n(fong, 0), "insecticides": _n(ins, 0), "n_depts": nd}
        complete = [a for a, v in out["bnvd"]["annees"].items() if v["n_depts"] >= 90]
        ref = max(complete) if complete else max(out["bnvd"]["annees"])
        out["bnvd"]["annee_ref"] = ref
        out["bnvd"]["top_substances"] = [
            {"s": s, "f": f, "kg": _n(q, 0), "cas": cas} for s, f, q, cas in con.execute(f"""
                SELECT libelle_substance, any_value(fonction), sum(quantite), any_value(code_cas) FROM ventes
                WHERE annee = {ref} GROUP BY 1 ORDER BY 3 DESC LIMIT 30""").fetchall()]
        for dep, q, herb, fong, top in con.execute(f"""
                SELECT code_departement, sum(quantite), sum(quantite) FILTER (WHERE fonction ILIKE 'herbicide%'),
                       sum(quantite) FILTER (WHERE fonction ILIKE 'fongicide%'),
                       (SELECT list(struct_pack(s := libelle_substance, kg := round(kg, 0)))
                        FROM (SELECT libelle_substance, sum(quantite) kg FROM ventes v2
                              WHERE v2.code_departement = v.code_departement AND v2.annee = {ref} GROUP BY 1 ORDER BY 2 DESC LIMIT 8))
                FROM ventes v WHERE annee = {ref} GROUP BY 1""").fetchall():
            out["bnvd"].setdefault("depts", {})[dep] = {"kg": _n(q, 0), "herbicides": _n(herb, 0), "fongicides": _n(fong, 0), "top": top}
        print(f"  BNV-D : {len(out['bnvd']['annees'])} années, référence {ref}")

    # --- ADES : nitrates et pesticides dans les nappes ---------------------------------------------
    for code, key, seuil, demi in (("1340", "nitrates", 50.0, 25.0), ("6276", "pesticides", 0.5, 0.1)):
        files = _glob(f"ades/{code}")
        if not files:
            continue
        con.execute(f"""
            CREATE OR REPLACE VIEW ana AS
            SELECT code_bss, num_departement, code_insee_actuel, longitude, latitude, resultat,
                   CAST(year(CAST(date_debut_prelevement AS TIMESTAMP)) AS INTEGER) AS annee,
                   list_contains(codes_reseau, '{RESEAU_AEP_BRUTES}') AS aep
            FROM read_json_auto({files}, union_by_name=true, maximum_object_size=67108864)
            WHERE resultat IS NOT NULL""")
        con.execute("""
            CREATE OR REPLACE TABLE pts AS
            SELECT code_bss, any_value(num_departement) AS dept, any_value(code_insee_actuel) AS insee,
                   any_value(longitude) AS lon, any_value(latitude) AS lat, bool_or(aep) AS aep,
                   max(annee) AS derniere_annee, count(*) AS n, max(resultat) AS vmax, avg(resultat) AS vmoy,
                   arg_max(resultat, annee) AS vlast
            FROM ana GROUP BY 1""")
        nat = con.execute(f"""
            SELECT count(*), count(*) FILTER (WHERE vmax > {seuil}), count(*) FILTER (WHERE vmax > {demi}),
                   count(*) FILTER (WHERE aep), count(*) FILTER (WHERE aep AND vmax > {seuil}), quantile_cont(vmoy, 0.5)
            FROM pts""").fetchone()
        out["ades"][key] = {"seuil": seuil, "n_points": nat[0], "sup_seuil": nat[1], "sup_demi": nat[2],
                            "n_points_aep": nat[3], "aep_sup_seuil": nat[4], "mediane": _n(nat[5]), "depts": {}}
        for dep, n, s, h, na, sa, med in con.execute(f"""
                SELECT dept, count(*), count(*) FILTER (WHERE vmax > {seuil}), count(*) FILTER (WHERE vmax > {demi}),
                       count(*) FILTER (WHERE aep), count(*) FILTER (WHERE aep AND vmax > {seuil}), quantile_cont(vmoy, 0.5)
                FROM pts GROUP BY 1""").fetchall():
            out["ades"][key]["depts"][dep] = {"n": n, "sup_seuil": s, "sup_demi": h, "n_aep": na, "aep_sup_seuil": sa, "mediane": _n(med)}
        for bss, dep, insee, lon, lat, aep, an, n, vmax, vmoy, vlast in con.execute("SELECT * FROM pts").fetchall():
            d = depts.setdefault(dep, {"ouvrages": {}, "nappes": {}})
            d["nappes"].setdefault(bss, {"commune": insee, "lon": _n(lon, 4), "lat": _n(lat, 4), "aep": bool(aep)})[key] = \
                {"annee": an, "n": n, "max": _n(vmax), "moy": _n(vmoy), "dernier": _n(vlast)}
        print(f"  ADES {key} : {nat[0]} points, {nat[1]} au-dessus de {seuil}")

    # --- Naïades : nitrates et pesticides dans les rivières (eaux de surface captées) ----------------
    # Seuils des eaux brutes destinées à la production d'eau potable : 50 mg/L de nitrates, 5 µg/L de pesticides totaux.
    for code, key, seuil, demi in (("1340", "nitrates", 50.0, 25.0), ("6276", "pesticides", 5.0, 0.5)):
        files = _glob(f"naiades/{code}")
        if not files:
            continue
        con.execute(f"""
            CREATE OR REPLACE VIEW riv AS
            SELECT code_station, libelle_station, longitude, latitude, resultat,
                   -- l'API ne renvoie pas le département : on le lit dans le nom du fichier de cache (<dept>.json)
                   regexp_extract(filename, '([^/]+)[.]json$', 1) AS code_departement,
                   CAST(substr(CAST(date_prelevement AS VARCHAR), 1, 4) AS INTEGER) AS annee
            FROM read_json_auto({files}, union_by_name=true, maximum_object_size=67108864, filename=true)
            WHERE resultat IS NOT NULL""")
        con.execute("""
            CREATE OR REPLACE TABLE stations AS
            SELECT code_station, any_value(libelle_station) AS nom, any_value(code_departement) AS dept,
                   any_value(longitude) AS lon, any_value(latitude) AS lat, max(annee) AS derniere_annee, count(*) AS n,
                   max(resultat) AS vmax, avg(resultat) AS vmoy, arg_max(resultat, annee) AS vlast
            FROM riv GROUP BY 1""")
        nat = con.execute(f"""
            SELECT count(*), count(*) FILTER (WHERE vmax > {seuil}), count(*) FILTER (WHERE vmax > {demi}), quantile_cont(vmoy, 0.5)
            FROM stations""").fetchone()
        out.setdefault("rivieres", {})[key] = {"seuil": seuil, "n_stations": nat[0], "sup_seuil": nat[1], "sup_demi": nat[2],
                                              "mediane": _n(nat[3]), "depts": {}}
        for dep, n, s, h, med in con.execute(f"""
                SELECT dept, count(*), count(*) FILTER (WHERE vmax > {seuil}), count(*) FILTER (WHERE vmax > {demi}), quantile_cont(vmoy, 0.5)
                FROM stations WHERE dept IS NOT NULL GROUP BY 1""").fetchall():
            out["rivieres"][key]["depts"][dep] = {"n": n, "sup_seuil": s, "sup_demi": h, "mediane": _n(med)}
        for code_st, nom, dep, lon, lat, an, n, vmax, vmoy, vlast in con.execute("SELECT * FROM stations WHERE dept IS NOT NULL").fetchall():
            d = depts.setdefault(dep, {"ouvrages": {}, "nappes": {}})
            d.setdefault("rivieres", {}).setdefault(code_st, {"nom": nom, "lon": _n(lon, 4), "lat": _n(lat, 4)})[key] = \
                {"annee": an, "n": n, "max": _n(vmax), "moy": _n(vmoy), "dernier": _n(vlast)}
        print(f"  Naïades {key} : {nat[0]} stations, {nat[1]} au-dessus de {seuil}")

    # --- Croisement avec le robinet (thème pesticides du contrôle sanitaire) -----------------------
    th_path = C.WEB_DATA / "themes" / "pesticides.json"
    meta_path = C.WEB_DATA / "meta.json"
    if th_path.exists() and meta_path.exists():
        th = json.loads(th_path.read_text(encoding="utf-8"))
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        complete = [a for a in meta["annees"] if a not in meta.get("partiel", [])]
        ref = str(max(complete)) if complete else str(max(meta["annees"]))
        out["croisement"]["annee_robinet"] = int(ref)
        for sise, by_year in th["depts"].items():
            dep = sise[1:] if len(sise) == 3 and sise.startswith("0") else sise
            v = by_year.get(ref)
            if not v or not v["res_tot"]:
                continue
            out["croisement"].setdefault("depts", {})[dep] = {
                "robinet_part_reseaux": _n(v["res_dep"] / v["res_tot"], 3), "robinet_res_dep": v["res_dep"], "robinet_res_tot": v["res_tot"],
                "ventes_kg": (out["bnvd"].get("depts", {}).get(dep) or {}).get("kg"),
                "nappes_nitrates_sup50": (out["ades"].get("nitrates", {}).get("depts", {}).get(dep) or {}).get("sup_seuil"),
                "nappes_nitrates_n": (out["ades"].get("nitrates", {}).get("depts", {}).get(dep) or {}).get("n"),
                "nappes_pesticides_sup": (out["ades"].get("pesticides", {}).get("depts", {}).get(dep) or {}).get("sup_seuil"),
                "nappes_pesticides_n": (out["ades"].get("pesticides", {}).get("depts", {}).get(dep) or {}).get("n"),
                "rivieres_nitrates_sup": (out.get("rivieres", {}).get("nitrates", {}).get("depts", {}).get(dep) or {}).get("sup_seuil"),
                "rivieres_nitrates_n": (out.get("rivieres", {}).get("nitrates", {}).get("depts", {}).get(dep) or {}).get("n"),
                "rivieres_pesticides_sup": (out.get("rivieres", {}).get("pesticides", {}).get("depts", {}).get(dep) or {}).get("sup_seuil"),
                "rivieres_pesticides_n": (out.get("rivieres", {}).get("pesticides", {}).get("depts", {}).get(dep) or {}).get("n"),
                "aep_part_sout": (out["bnpe"].get("depts", {}).get(dep) or {}).get("part_sout"),
                "aep_volume": (out["bnpe"].get("depts", {}).get(dep) or {}).get("volume"),
            }

    _dump(C.WEB_DATA / "amont" / "national.json", out)
    for dep, d in depts.items():
        _dump(C.WEB_DATA / "amont" / "dept" / f"{dep}.json", d)
    print(f"Amont terminé en {time.time() - t0:.0f}s")

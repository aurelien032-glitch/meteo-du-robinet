"""Agrégats SISPEA (services d'eau potable) → fichiers statiques du site.

Sorties :
  sispea/national.json     par année : prix, rendement, renouvellement, pertes, par mode de gestion, par département,
                           plus la série longue 2008-2019 issue de l'API Hub'Eau
  sispea/dept/<dd>.json    par commune et par année : service, mode de gestion, opérateur, indicateurs
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import duckdb
import pandas as pd

from . import config as C
from .sispea import INDICATEURS

IND_MAIN = ["D101.0", "D102.0", "P101.1", "P102.1", "P103.2B", "P104.3", "P105.3", "P106.3", "P107.2", "P108.3",
            "P151.1", "P152.1", "P153.2", "P154.0", "P155.1"]

GESTION_SQL = """CASE WHEN lower(strip_accents(coalesce(mode_gestion, ''))) LIKE 'regie%' THEN 'regie'
                      WHEN lower(strip_accents(coalesce(mode_gestion, ''))) LIKE 'delegation%' THEN 'delegation'
                      ELSE NULL END"""


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


def _dept_of_insee(insee: str) -> str:
    return insee[:3] if insee.startswith(("97", "98")) else insee[:2]


def api_history_to_parquet() -> Path | None:
    """Historique 2008-2019 (API Hub'Eau, un fichier JSON par indicateur et par année) → Parquet."""
    src = C.CACHE / "sispea_api"
    dest = C.OUT / "sispea" / "api_history.parquet"
    if not src.exists():
        return None
    rows = []
    for f in sorted(src.glob("*.json")):
        ind, annee = f.stem.rsplit("_", 1)
        for r in json.loads(f.read_text(encoding="utf-8")):
            rows.append({"code_service": r.get("code_service"), "annee": int(annee), "code_indicateur": ind,
                         "valeur": r.get("indicateur"), "mode_gestion": r.get("mode_gestion"),
                         "type_collectivite": r.get("type_collectivite"),
                         "nb_communes": len(r.get("codes_commune") or []),
                         "codes_commune": r.get("codes_commune") or []})
    if not rows:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_parquet(dest, index=False)
    print(f"  + historique API : {len(rows):,} lignes")
    return dest


def _stats_sql(ind: str, alias: str) -> str:
    col = f'"{ind}"'
    return (f"quantile_cont({col}, 0.5) AS {alias}_p50, quantile_cont({col}, 0.1) AS {alias}_p10, "
            f"quantile_cont({col}, 0.9) AS {alias}_p90, "
            f"sum({col} * pop) FILTER (WHERE {col} IS NOT NULL AND pop IS NOT NULL) "
            f"/ nullif(sum(pop) FILTER (WHERE {col} IS NOT NULL), 0) AS {alias}_pond, "
            f"count({col}) AS {alias}_n")


def run(years: list[int]) -> None:
    t0 = time.time()
    services = C.OUT / "sispea" / "services.parquet"
    composition = C.OUT / "sispea" / "composition.parquet"
    # Écrit par sispea.to_parquet(), toujours appelé avant run() dans la commande CLI `robinet sispea` :
    # son absence ici signale un mauvais ordre d'appel, pas un millésime pas encore publié (ce cas-là est
    # déjà un avertissement, plus haut, dans to_parquet lui-même).
    if not services.exists():
        raise RuntimeError("services.parquet absent : lancer `sispea.to_parquet()` avant `build_sispea.run()`")
    con = duckdb.connect()
    con.execute(f"""
        CREATE VIEW s AS
        SELECT *, {GESTION_SQL} AS gestion, coalesce("D101.0", pop_desservie) AS pop
        FROM read_parquet('{services.as_posix()}')""")
    has_comp = composition.exists()
    if has_comp:
        con.execute(f"CREATE VIEW c AS SELECT * FROM read_parquet('{composition.as_posix()}')")

    stats = ", ".join([_stats_sql("D102.0", "prix"), _stats_sql("P104.3", "rend"), _stats_sql("P106.3", "ilp"),
                       _stats_sql("P107.2", "renouv"), _stats_sql("P101.1", "cbact"), _stats_sql("P102.1", "cchim"),
                       _stats_sql("P103.2B", "patrim"), _stats_sql("P154.0", "impayes")])
    cols = ["prix", "rend", "ilp", "renouv", "cbact", "cchim", "patrim", "impayes"]

    def unpack(row, offset: int) -> dict:
        d = {}
        for i, c in enumerate(cols):
            b = offset + i * 5
            d[c] = {"p50": _n(row[b]), "p10": _n(row[b + 1]), "p90": _n(row[b + 2]), "pond": _n(row[b + 3]), "n": row[b + 4]}
        return d

    out: dict = {"annees": {}, "gestion": {}, "depts": {}, "serie_api": {}}
    for row in con.execute(f"SELECT annee, count(*), sum(pop), {stats} FROM s GROUP BY 1 ORDER BY 1").fetchall():
        out["annees"][row[0]] = {"n": row[1], "pop": _n(row[2], 0), **unpack(row, 3)}
    for row in con.execute(f"SELECT annee, gestion, count(*), sum(pop), {stats} FROM s WHERE gestion IS NOT NULL GROUP BY 1, 2").fetchall():
        out["gestion"].setdefault(row[0], {})[row[1]] = {"n": row[2], "pop": _n(row[3], 0), **unpack(row, 4)}
    for row in con.execute(f"""
            SELECT dept, annee, count(*), sum(pop),
                   sum(pop) FILTER (WHERE gestion = 'delegation') / nullif(sum(pop) FILTER (WHERE gestion IS NOT NULL), 0),
                   {stats}
            FROM s WHERE dept IS NOT NULL GROUP BY 1, 2""").fetchall():
        out["depts"].setdefault(row[0], {})[row[1]] = {"n": row[2], "pop": _n(row[3], 0), "part_pop_delegation": _n(row[4], 3),
                                                     **unpack(row, 5)}

    hist = api_history_to_parquet()
    if hist:
        con.execute(f"CREATE VIEW h AS SELECT * FROM read_parquet('{hist.as_posix()}')")
        for annee, ind, p50, p10, p90, n in con.execute("""
                SELECT annee, code_indicateur, quantile_cont(valeur, 0.5), quantile_cont(valeur, 0.1), quantile_cont(valeur, 0.9), count(valeur)
                FROM h WHERE valeur IS NOT NULL GROUP BY 1, 2 ORDER BY 1""").fetchall():
            out["serie_api"].setdefault(annee, {})[ind] = {"p50": _n(p50), "p10": _n(p10), "p90": _n(p90), "n": n}
    out["indicateurs"] = INDICATEURS
    _dump(C.WEB_DATA / "sispea" / "national.json", out)

    if not has_comp:
        raise RuntimeError("composition.parquet absent : lancer `sispea.composition_to_parquet()` avant `build_sispea.run()`")
    ind_cols = ", ".join(f's."{i}"' for i in IND_MAIN)
    rows = con.execute(f"""
        SELECT c.insee, c.annee, c.id_service, coalesce(s.nom_service, c.nom_service), coalesce(s.nom_coll, c.nom_coll),
               coalesce(s.mode_gestion, c.mode_gestion), coalesce(s.nom_operateur, c.nom_operateur), s.pop, c.population,
               c.secteur, c.statut_donnees, {ind_cols}
        FROM c LEFT JOIN s ON s.id_service = c.id_service AND s.annee = c.annee
        WHERE c.insee IS NOT NULL
        -- une commune adhère souvent à plusieurs entités (production, transfert, distribution) :
        -- on retient celle qui porte le prix, sinon le rendement, sinon la plus peuplée
        QUALIFY row_number() OVER (PARTITION BY c.insee, c.annee
                                   ORDER BY (s."D102.0" IS NOT NULL) DESC, (s."P104.3" IS NOT NULL) DESC,
                                            (c.distribution = 'Oui') DESC, s.pop DESC NULLS LAST, c.id_service) = 1
        ORDER BY 1, 2""").fetchall()
    by_dept: dict[str, dict] = {}
    for r in rows:
        insee, annee, sid, nom, coll, mode, op, pop, pop_com, secteur, statut = r[:11]
        ind = {code: _n(v) for code, v in zip(IND_MAIN, r[11:]) if v is not None and v == v}
        by_dept.setdefault(_dept_of_insee(insee), {}).setdefault(insee, {})[annee] = {
            "id": sid, "nom": nom, "coll": coll, "mode": mode, "op": op, "pop": _n(pop, 0), "pop_com": _n(pop_com, 0),
            "secteur": secteur, "statut": statut, "ind": ind}
    for dept, communes in by_dept.items():
        _dump(C.WEB_DATA / "sispea" / "dept" / f"{dept}.json", communes)

    # Index des services (vue par collectivité) : dernière année où le service a des communes rattachées,
    # indicateurs de la dernière année renseignée.
    services: dict[str, dict] = {}
    for r in rows:
        insee, annee, sid = r[0], r[1], r[2]
        if not sid:
            continue
        s = services.setdefault(sid, {"annees": {}})
        s["annees"].setdefault(annee, []).append(insee)
    for sid, nom, coll, dept, mode, op, statut, pop, annee, ind in con.execute(f"""
            SELECT id_service, arg_max(nom_service, annee), arg_max(nom_coll, annee), arg_max(dept, annee),
                   arg_max(mode_gestion, annee), arg_max(nom_operateur, annee), arg_max(statut, annee), arg_max(pop, annee),
                   max(annee) FILTER (WHERE "D102.0" IS NOT NULL OR "P104.3" IS NOT NULL),
                   arg_max(struct_pack({', '.join(f'"{i}" := "{i}"' for i in IND_MAIN)}), annee) FILTER (WHERE "D102.0" IS NOT NULL OR "P104.3" IS NOT NULL)
            FROM s WHERE id_service IS NOT NULL GROUP BY 1""").fetchall():
        s = services.setdefault(sid, {"annees": {}})
        s.update({"nom": nom, "coll": coll, "dept": dept, "mode": mode, "op": op, "statut": statut, "pop": _n(pop, 0),
                  "annee_ind": annee, "ind": {k: _n(v) for k, v in (ind or {}).items() if v is not None and v == v}})
    for s in services.values():
        if s["annees"]:
            last = max(s["annees"])
            s["annee_communes"] = last
            s["communes"] = sorted(set(s["annees"][last]))
        s.pop("annees", None)
    # Index léger (recherche de collectivité, routage) + détail par département.
    index = {sid: [s.get("coll") or s.get("nom"), s.get("dept"), s.get("pop"), s.get("mode"), s.get("nom")]
             for sid, s in services.items()}
    _dump(C.WEB_DATA / "sispea" / "services-index.json", index)
    by_dept_s: dict[str, dict] = {}
    for sid, s in services.items():
        by_dept_s.setdefault(s.get("dept") or "00", {})[sid] = s
    for d, m in by_dept_s.items():
        _dump(C.WEB_DATA / "sispea" / "services" / f"{d}.json", m)
    old = C.WEB_DATA / "sispea" / "services.json"
    if old.exists():
        old.unlink()
    print(f"SISPEA terminé en {time.time() - t0:.0f}s")

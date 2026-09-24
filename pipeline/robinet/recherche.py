"""Index de la recherche unique du site (maquette du 23/09) : communes, services d'eau et syndicats, réseaux.

Sorties (web/public/data/recherche/), des colonnes compactes que le navigateur classe lui-même
(web/src/lib/recherche.ts) ; la première colonne, les codes, est écrite en écarts (fonction `ecarts`) :
  communes.json  {"c": codes INSEE, "n": noms, "p": poids}  les communes de communes.json, par code
  services.json  {"i": identifiants, "n": collectivités, "e": entités, "d": départements, "p": poids, "m": modes}
                 les services qui ont des communes rattachées dans la dernière composition SISPEA (les autres ont
                 fusionné ou disparu), par identifiant ; mode « regie », « delegation » ou null
  reseaux.json   {"c": codes, "n": noms, "k": communes desservies}  dernier nom et dernière composition connus
                 de chaque réseau, par code
  departements.json  {code: nom}  les 101 départements des contours (geo/departements.json, 2 Mo, que la
                 recherche ne charge pas pour si peu)
Compressés, en 2025 : 217, 118 et 185 Ko, contre 292, 153 et 248 en lignes aux codes écrits en entier.
Le poids ordonne les résultats à pertinence égale sans publier de population : 4 × log₂ de la population municipale
(communes) ou des habitants desservis (services), arrondi — un cran vaut environ 19 % —, 0 si elle est inconnue.

communes.json et sispea/services-index.json, lus par sept pages, ne changent pas. Tout se lit dans les Parquet
intermédiaires et dans communes.json, avec une connexion DuckDB en mémoire : la commande ne verrouille rien et peut
tourner à côté d'un autre traitement. À lancer après `build` et `sispea`.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

import duckdb

from . import config as C
from .build_sispea import GESTION_SQL


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = len(obj["n"]) if isinstance(obj, dict) and isinstance(obj.get("n"), list) else len(obj)
    print(f"  → {path.relative_to(C.ROOT).as_posix()} ({path.stat().st_size / 1e3:.0f} ko, {n} entrées)")


def population_communes(con: duckdb.DuckDBPyConnection, composition: Path) -> dict[str, float]:
    """Population municipale de chaque commune, dans la dernière composition SISPEA où elle figure."""
    return dict(con.execute(f"""
        SELECT insee, arg_max(population, annee) FROM read_parquet('{composition.as_posix()}')
        WHERE insee IS NOT NULL AND population IS NOT NULL GROUP BY 1""").fetchall())


def poids(population: float | None) -> int:
    """Poids de classement : 4 × log₂ de la population, arrondi ; 0 si elle est inconnue."""
    return round(4 * math.log2(population)) if population and population >= 1 else 0


def ecarts(codes: list[str]) -> list[int | str]:
    """Codes en écarts : un entier donne l'écart au code précédent, de même préfixe et de même largeur de chiffres
    (« 35238 » puis « 35240 » : 2) ; une chaîne, le code complet — en tête, quand le préfixe ou la largeur change
    (« 2A001 », « 320874 » après « 90290 »), ou si l'ordre recule. Les codes triés se suivent de près : ceux des
    communes passent de 79 à 4 Ko compressés. Relus par `relireCodes` (web/src/lib/recherche.ts)."""
    sortie: list[int | str] = []
    prec: tuple[str, int, int] | None = None
    for code in codes:
        m = re.fullmatch(r"(.*?)(\d+)", code)
        cle = (m.group(1), len(m.group(2)), int(m.group(2))) if m else None
        sortie.append(cle[2] - prec[2] if cle and prec and cle[:2] == prec[:2] and cle[2] > prec[2] else code)
        prec = cle
    return sortie


def colonnes(lignes: list[list], cles: str) -> dict[str, list]:
    """Lignes [code, …] en colonnes nommées par `cles` (une lettre par colonne), la première, les codes, en écarts."""
    cols = {k: [ligne[j] for ligne in lignes] for j, k in enumerate(cles)}
    cols[cles[0]] = ecarts(cols[cles[0]])
    return cols


def index_communes(communes: list[dict], population: dict[str, float]) -> list[list]:
    """Communes du site (entrées « c », « n » de communes.json) : [code, nom, poids], par code."""
    return [[e["c"], e["n"], poids(population.get(e["c"]))] for e in sorted(communes, key=lambda e: e["c"])]


def _entite(nom: str | None) -> str | None:
    """Nom de l'entité de gestion sans le préfixe commun « eau potable : » (« eau potable » seul ne dit rien)."""
    e = re.sub(r"^eau potable\s*:?\s*", "", (nom or "").strip(), flags=re.IGNORECASE).strip()
    return e or None


def index_services(con: duckdb.DuckDBPyConnection, services: Path, composition: Path) -> list[list]:
    """Services qui ont des communes rattachées dans la dernière composition SISPEA. Noms, département et mode de la
    dernière année connue (à défaut, ceux de la composition) ; habitants desservis de la dernière année renseignée.
    Par identifiant, dans l'ordre des nombres (« 555 » avant « 77654 ») pour que les écarts restent petits."""
    rows = con.execute(f"""
        WITH c AS (SELECT * FROM read_parquet('{composition.as_posix()}')),
        actuels AS (
            SELECT id_service, arg_max(nom_coll, population) AS coll, arg_max(nom_service, population) AS entite,
                   arg_max(CASE WHEN insee LIKE '97%' THEN left(insee, 3) ELSE left(insee, 2) END, population) AS dept,
                   arg_max(mode_gestion, population) AS mode_gestion
            FROM c WHERE annee = (SELECT max(annee) FROM c) AND id_service IS NOT NULL GROUP BY 1),
        s AS (
            SELECT id_service, arg_max(nom_coll, annee) AS coll, arg_max(nom_service, annee) AS entite,
                   arg_max(dept, annee) AS dept, arg_max(mode_gestion, annee) AS mode_gestion,
                   arg_max(coalesce("D101.0", pop_desservie), annee)
                       FILTER (WHERE coalesce("D101.0", pop_desservie) IS NOT NULL) AS pop
            FROM read_parquet('{services.as_posix()}') WHERE id_service IS NOT NULL GROUP BY 1),
        j AS (
            SELECT a.id_service, coalesce(s.coll, a.coll) AS coll, coalesce(s.entite, a.entite) AS entite,
                   coalesce(s.dept, a.dept) AS dept, s.pop, coalesce(s.mode_gestion, a.mode_gestion) AS mode_gestion
            FROM actuels a LEFT JOIN s USING (id_service))
        SELECT id_service, coll, entite, dept, pop, {GESTION_SQL} FROM j
        ORDER BY length(id_service), id_service""").fetchall()
    return [[sid, coll, _entite(entite), dept, poids(pop), mode] for sid, coll, entite, dept, pop, mode in rows]


def index_reseaux(con: duckdb.DuckDBPyConnection, com_udi: str) -> list[list]:
    """Réseaux : dernier nom connu et nombre de communes desservies la dernière année où le réseau figure. `com_udi`
    est un motif de fichiers (agg/*/com_udi.parquet)."""
    return [list(r) for r in con.execute(f"""
        WITH u AS (
            SELECT cdreseau, nomreseau, inseecommune, annee FROM read_parquet('{com_udi}')
            WHERE cdreseau IS NOT NULL AND cdreseau <> ''),
        der AS (SELECT cdreseau, max(annee) AS annee FROM u GROUP BY 1)
        SELECT u.cdreseau, arg_max(u.nomreseau, u.annee), count(DISTINCT u.inseecommune) FILTER (WHERE u.annee = der.annee)
        FROM u JOIN der USING (cdreseau) GROUP BY 1 ORDER BY 1""").fetchall()]


def noms_departements(contours: dict) -> dict[str, str]:
    """Code et nom de chaque département, lus dans les propriétés des contours publiés par `robinet geo`."""
    return {str(f["properties"]["code"]): str(f["properties"]["nom"]) for f in contours.get("features", [])}


def run() -> None:
    composition = C.OUT / "sispea" / "composition.parquet"
    services = C.OUT / "sispea" / "services.parquet"
    communes = C.WEB_DATA / "communes.json"
    for f in (composition, services, communes):
        if not f.exists():
            raise RuntimeError(f"{f.name} absent : lancer `robinet build` puis `robinet sispea` avant `robinet recherche`")
    con = duckdb.connect()
    out = C.WEB_DATA / "recherche"
    index = json.loads(communes.read_text(encoding="utf-8"))
    _dump(out / "communes.json", colonnes(index_communes(index, population_communes(con, composition)), "cnp"))
    _dump(out / "services.json", colonnes(index_services(con, services, composition), "inedpm"))
    _dump(out / "reseaux.json", colonnes(index_reseaux(con, (C.OUT / "agg" / "*" / "com_udi.parquet").as_posix()), "cnk"))
    contours = C.WEB_DATA / "geo" / "departements.json"
    if contours.exists():
        _dump(out / "departements.json", noms_departements(json.loads(contours.read_text(encoding="utf-8"))))
    else:
        print("  ! geo/departements.json absent (lancer `robinet geo`) : la recherche affichera les codes des départements")

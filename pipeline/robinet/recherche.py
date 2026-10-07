"""Index de la recherche unique du site (maquette du 23/09) : communes, services d'eau et syndicats, réseaux.

Sorties (web/public/data/recherche/), des colonnes compactes que le navigateur classe lui-même
(web/src/lib/recherche.ts) ; la première colonne, les codes, est écrite en écarts (fonction `ecarts`) :
  communes.json  {"c": codes INSEE, "n": noms, "p": poids, "z": codes postaux}  les communes de communes.json, par
                 code ; « z » : un code postal (chaîne), plusieurs (liste) ou null, d'après la base officielle des codes
                 postaux de La Poste (data.gouv.fr, licence ouverte ; data/raw/codes-postaux, `codes_postaux_communes`)
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
tourner à côté d'un autre traitement. À lancer après `build` et `sispea`. La base des codes postaux est téléchargée
par la commande elle-même (download.download_codes_postaux : seulement si elle a changé, cache gardé en cas de panne).
"""
from __future__ import annotations

import csv
import io
import json
import math
import re
import unicodedata
from pathlib import Path

import duckdb

from . import config as C
from .util import dump
from .build_sispea import DECLARATION_SQL, GESTION_SQL


def _dump(path: Path, obj) -> None:
    dump(path, obj, entrees=len(obj["n"]) if isinstance(obj, dict) and isinstance(obj.get("n"), list) else len(obj))


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


def index_communes(communes: list[dict], population: dict[str, float],
                   postaux: dict[str, list[str]] | None = None) -> list[list]:
    """Communes du site (entrées « c », « n » de communes.json) : [code, nom, poids, codes postaux], par code. Codes
    postaux : une chaîne s'il n'y en a qu'un (34 466 communes sur 34 908 en 2026), une liste s'il y en a plusieurs,
    null si la base de La Poste n'en donne aucun."""
    postaux = postaux or {}

    def z(code: str):
        cps = postaux.get(code) or []
        return cps[0] if len(cps) == 1 else (cps or None)

    return [[e["c"], e["n"], poids(population.get(e["c"])), z(e["c"])] for e in sorted(communes, key=lambda e: e["c"])]


# --- Codes postaux (base officielle de La Poste, lot 2 de la refonte, 05/10) --------------------------------------
# Taper « 02100 », le code postal de Saint-Quentin, menait à Bony, dont c'est le code INSEE (audit du 05/10). La base
# HexaSmal donne, pour chaque commune (code INSEE), ses codes postaux ; une commune peut en avoir plusieurs (Rennes :
# 35000, 35200, 35700), un code postal couvrir plusieurs communes (02100 : onze).

# Arrondissements municipaux, rattachés à leur commune (communeDeRattachement du site) : La Poste les code seuls.
ARRONDISSEMENTS = {"75056": "751", "13055": "132", "69123": "6938"}


def lire_codes_postaux(path: Path) -> list[tuple[str, str, str, str]]:
    """Lignes de la base HexaSmal : (code INSEE, nom de la commune, code postal, ligne 5). Le fichier est en Latin-1
    (2026) ; UTF-8 accepté s'il change. L'en-tête est vérifié : un format différent échoue plutôt que d'indexer des
    colonnes décalées. Les codes postaux qui ne sont pas de cinq chiffres sont écartés."""
    brut = path.read_bytes()
    try:
        texte = brut.decode("utf-8-sig")
    except UnicodeDecodeError:
        texte = brut.decode("latin-1")
    lignes = list(csv.reader(io.StringIO(texte), delimiter=";"))
    if not lignes:
        raise RuntimeError(f"{path.name} vide")
    tete = [h.lstrip("#").strip().lower() for h in lignes[0]]
    if len(tete) < 5 or "insee" not in tete[0] or "postal" not in tete[2]:
        raise RuntimeError(f"{path.name} : en-tête inattendu {lignes[0]!r} (base des codes postaux de La Poste)")
    return [(r[0].strip(), r[1].strip(), r[2].strip(), r[4].strip()) for r in lignes[1:]
            if len(r) >= 5 and re.fullmatch(r"\d{5}", r[2].strip())]


def _dept(insee: str) -> str:
    return insee[:3] if insee.startswith("97") else insee[:2]


def _nom_poste(nom: str) -> str:
    """Nom sous la forme de La Poste : capitales sans accents, article en tête (« MONT-DIEU (LE) » → « LE MONT DIEU »),
    « SAINT » et « SAINTE » abrégés, ponctuation réduite à une espace."""
    s = "".join(c for c in unicodedata.normalize("NFD", nom) if not unicodedata.combining(c)).upper().strip()
    m = re.fullmatch(r"(.*?)\s*\((LE|LA|LES|L')\)", s)
    if m:
        s = f"{m.group(2)} {m.group(1)}"
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    s = re.sub(r"\bSAINTE\b", "STE", re.sub(r"\bSAINT\b", "ST", s))
    return s.strip()


def codes_postaux_communes(communes: list[dict], lignes: list[tuple[str, str, str, str]]) -> dict[str, list[str]]:
    """Codes postaux de chaque commune du site, triés. D'abord par le code INSEE ; Paris, Marseille et Lyon réunissent
    ceux de leurs arrondissements ; à défaut (commune déléguée que le contrôle sanitaire suit encore, commune
    renumérotée), par le nom dans le même département, en « ligne 5 » (commune déléguée d'une commune nouvelle) puis en
    nom de commune. Sans résultat, la commune n'a pas de code postal."""
    par_insee: dict[str, set[str]] = {}
    par_ligne5: dict[tuple[str, str], set[str]] = {}
    par_nom: dict[tuple[str, str], set[str]] = {}
    for insee, nom, cp, ligne5 in lignes:
        par_insee.setdefault(insee, set()).add(cp)
        par_nom.setdefault((_dept(insee), _nom_poste(nom)), set()).add(cp)
        if ligne5:
            par_ligne5.setdefault((_dept(insee), _nom_poste(ligne5)), set()).add(cp)
    sortie: dict[str, list[str]] = {}
    for e in communes:
        code = e["c"]
        cps = par_insee.get(code)
        if not cps and code in ARRONDISSEMENTS:
            cps = set().union(*(v for k, v in par_insee.items() if k.startswith(ARRONDISSEMENTS[code])))
        if not cps:
            cle = (_dept(code), _nom_poste(e["n"]))
            cps = par_ligne5.get(cle) or par_nom.get(cle)
        if cps:
            sortie[code] = sorted(cps)
    return sortie


def _entite(nom: str | None) -> str | None:
    """Nom de l'entité de gestion sans le préfixe commun « eau potable : » (« eau potable » seul ne dit rien)."""
    e = re.sub(r"^eau potable\s*:?\s*", "", (nom or "").strip(), flags=re.IGNORECASE).strip()
    return e or None


def index_services(con: duckdb.DuckDBPyConnection, services: Path, composition: Path) -> list[list]:
    """Services qui ont des communes rattachées dans la dernière composition SISPEA. Noms et mode de la déclaration qui
    date leur fiche (celle de leurs indicateurs, à défaut la dernière : build_sispea.services_declares), département de
    la dernière déclaration, comme la fiche ; à défaut ceux de la composition ; habitants desservis de la dernière année
    renseignée. Par identifiant, dans l'ordre des nombres (« 555 » avant « 77654 ») pour que les écarts restent petits."""
    ligne = "struct_pack(coll := nom_coll, entite := nom_service, mode_gestion := mode_gestion)"
    rows = con.execute(f"""
        WITH c AS (SELECT * FROM read_parquet('{composition.as_posix()}')),
        actuels AS (
            SELECT id_service, arg_max(nom_coll, population) AS coll, arg_max(nom_service, population) AS entite,
                   arg_max(CASE WHEN insee LIKE '97%' THEN left(insee, 3) ELSE left(insee, 2) END, population) AS dept,
                   arg_max(mode_gestion, population) AS mode_gestion
            FROM c WHERE annee = (SELECT max(annee) FROM c) AND id_service IS NOT NULL GROUP BY 1),
        declares AS (
            SELECT id_service,
                   coalesce(arg_max({ligne}, annee) FILTER (WHERE {DECLARATION_SQL}), arg_max({ligne}, annee)) AS d,
                   arg_max(dept, annee) AS dept,
                   arg_max(coalesce("D101.0", pop_desservie), annee)
                       FILTER (WHERE coalesce("D101.0", pop_desservie) IS NOT NULL) AS pop
            FROM read_parquet('{services.as_posix()}') WHERE id_service IS NOT NULL GROUP BY 1),
        s AS (
            SELECT id_service, d.coll AS coll, d.entite AS entite, dept, d.mode_gestion AS mode_gestion, pop
            FROM declares),
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
    from .download import download_codes_postaux
    print("Codes postaux (La Poste) :")
    postaux = codes_postaux_communes(index, lire_codes_postaux(download_codes_postaux()))
    sans = len(index) - len(postaux)
    print(f"  {len(postaux)} communes avec un code postal" + (f", {sans} sans" if sans else ""))
    _dump(out / "communes.json", colonnes(index_communes(index, population_communes(con, composition), postaux), "cnpz"))
    _dump(out / "services.json", colonnes(index_services(con, services, composition), "inedpm"))
    _dump(out / "reseaux.json", colonnes(index_reseaux(con, (C.OUT / "agg" / "*" / "com_udi.parquet").as_posix()), "cnk"))
    contours = C.WEB_DATA / "geo" / "departements.json"
    if contours.exists():
        _dump(out / "departements.json", noms_departements(json.loads(contours.read_text(encoding="utf-8"))))
    else:
        print("  ! geo/departements.json absent (lancer `robinet geo`) : la recherche affichera les codes des départements")

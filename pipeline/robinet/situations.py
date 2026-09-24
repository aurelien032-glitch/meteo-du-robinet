"""Situation de chaque réseau de distribution (UDI), par année et par famille de paramètres.

Présentation des bilans officiels (décision de l'auteur, 2026-09-22), à la place des parts de communes ou
d'habitants « concernés », qui comptaient toute une commune dès une seule analyse au-dessus de la limite.
Chaque famille suit la méthode de SON bilan officiel (recherche du 2026-09-22) :

  Pesticides — bilan national « qualité de l'eau du robinet vis-à-vis des pesticides » (ministère de la Santé) :
    0  C    conforme toute l'année
    1  NC0  dépassements de la limite pendant 30 jours cumulés au plus dans l'année
    2  NC1  dépassements pendant plus de 30 jours cumulés
    3  NC2  restriction de consommation citant les pesticides dans les conclusions de l'ARS. Le ministère
            définit NC2 par le dépassement de la valeur sanitaire maximale (Vmax), non publiée en données
            ouvertes : la restriction effectivement prononcée en tient lieu.
    Durée d'un dépassement : du premier résultat au-dessus de la limite au premier résultat conforme suivant
    sur le même réseau, ou au 31 décembre faute de résultat suivant dans l'année.

  Nitrates — bilan national « vis-à-vis des nitrates » : classe de la concentration MAXIMALE de l'année
    0  < 25 mg/L   1  25 à 40 mg/L   2  40 à 50 mg/L   3  > 50 mg/L au moins une fois (non conforme)

  Bactériologie — bilans des ARS (taux de conformité des analyses du réseau, bonne qualité à 95 %) :
    0  tous les prélèvements conformes   1  au moins 95 % de prélèvements conformes
    2  moins de 95 %                      3  consigne d'ébullition ou restriction de consommation

  PFAS, métaux et minéraux — conformité à la limite de qualité (pas de bilan national par durée) :
    0  conforme   1  au moins une analyse au-dessus de la limite   2  restriction de consommation
    (Pour les PFAS, l'ARS ne retient la non-conformité qu'après confirmation sur deux saisons, par la
    médiane : le site dit « dépassement constaté », non « non-conformité avérée ».)

  Toutes familles — 0 conforme pour toutes, 1 non conforme pour au moins une, 2 restriction ou consigne.

Unité : le RÉSEAU. Les bilans officiels pondèrent par la population desservie par chaque réseau, qui n'est
pas publiée en données ouvertes : le site compte des réseaux et le dit.

Sorties : web/public/data/situations/<année>.json, situations/national.json (série {année: national}) et
  situations/depts.json ({année: depts}, sans les codes des réseaux : quelques Ko, lus par la carte de l'accueil)
  {"familles": [...], "reseaux": {cdreseau: "0123…"}, "depts": {dd: {famille: [n0, n1, n2, n3]}},
   "national": {famille: [n0, n1, n2, n3]}}
  Le code d'un réseau est une chaîne d'un chiffre par famille, dans l'ordre de "familles" ; « - » = famille
  non analysée sur ce réseau dans l'année.
"""
from __future__ import annotations

import json
from pathlib import Path

import duckdb

from . import config as C

# Ordre des familles dans les codes de réseau et de commune (lu par le site : web/src/lib/situations.ts).
FAMILLES = ["pesticides", "azote", "pfas", "microbio", "metaux_mineraux"]
BINAIRES = ["pfas", "metaux_mineraux"]
NITRATES = "1340"
# Causes des conclusions de l'ARS (avis.CAUSES) qui valent restriction pour une famille.
CAUSES_FAMILLE = {
    "pesticides": ["pesticides"],
    "azote": ["nitrates"],
    "pfas": ["PFAS"],
    "metaux_mineraux": ["plomb", "arsenic", "sélénium", "aluminium", "fluorures", "manganèse"],
    "microbio": ["bactériologie"],
}
SEUIL_JOURS = 30
SEUIL_BACT = 0.95
CLASSES_NITRATES = (25.0, 40.0, 50.0)
AGG = C.OUT / "agg"


def non_conforme(fam: str, code: int) -> bool:
    """Le code d'une famille vaut-il non-conformité, au sens de son bilan officiel ?"""
    if fam == "azote":
        return code == 3
    if fam == "microbio":
        return code >= 2
    return code >= 1


def restriction(fam: str, code: int) -> bool:
    """Restriction de consommation (ou consigne d'ébullition pour la bactériologie) prononcée par l'ARS."""
    if fam == "azote":
        return False
    return code == (2 if fam in BINAIRES else 3)


def _bound(col: str, op: str) -> str:
    from .build import NUM_RE  # même lecture des seuils que les agrégats

    return f"TRY_CAST(replace(regexp_extract({col}, '{op}\\s*{NUM_RE}', 1), ',', '.') AS DOUBLE)"


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _dept(cddept: str | None, cdreseau: str) -> str:
    """Département au format des contours (« 01 », « 2A », « 971 ») à partir du code SISE (« 001 », « 02A », « 971 »)."""
    d = (cddept or cdreseau[:3] or "").strip()
    if d.startswith("97"):
        return d[:3]
    return d[-2:] if len(d) == 3 and d[0] == "0" else d


def situations_annee(con: duckdb.DuckDBPyConnection, year: int) -> dict[str, dict[str, int]]:
    """Code de situation par réseau et par famille pour une année : {cdreseau: {famille: code}}."""
    dis_dir = C.OUT / "dis" / str(year)
    result, plv = (dis_dir / "result.parquet").as_posix(), (dis_dir / "plv.parquet").as_posix()
    params = (AGG / str(year) / "params.parquet").as_posix()
    fams = ", ".join(f"'{f}'" for f in ["pesticides", *BINAIRES])

    # Jours d'analyse par réseau et par famille : dépassement ce jour-là ou non (paramètres à limite seulement),
    # et durée cumulée des dépassements (utile aux pesticides).
    jours = con.execute(f"""
        WITH r AS (
            SELECT referenceprel, cdparametre, valtraduite AS val,
                   {_bound('limitequal', '<=')} AS lim_max, {_bound('limitequal', '>=')} AS lim_min
            FROM read_parquet('{result}')),
        f AS (SELECT cdparametre, any_value(famille) AS famille FROM read_parquet('{params}') GROUP BY 1),
        p AS (SELECT referenceprel, any_value(dateprel) AS dateprel FROM read_parquet('{plv}') GROUP BY 1),
        pr AS (SELECT DISTINCT referenceprel, cdreseau FROM read_parquet('{plv}') WHERE cdreseau IS NOT NULL AND cdreseau <> ''),
        d AS (
            SELECT pr.cdreseau, f.famille, CAST(substr(p.dateprel, 1, 10) AS DATE) AS jour,
                   bool_or(coalesce((r.lim_max IS NOT NULL AND r.val > r.lim_max) OR (r.lim_min IS NOT NULL AND r.val < r.lim_min), false)) AS dep
            FROM r JOIN f USING (cdparametre) JOIN p USING (referenceprel) JOIN pr USING (referenceprel)
            WHERE f.famille IN ({fams}) AND (r.lim_max IS NOT NULL OR r.lim_min IS NOT NULL)
            GROUP BY 1, 2, 3)
        SELECT cdreseau, famille,
               count(*) FILTER (WHERE dep) AS jours_dep,
               sum(CASE WHEN dep THEN greatest(1, date_diff('day', jour, coalesce(suivant, make_date({year}, 12, 31)))) END) AS duree
        FROM (SELECT *, lead(jour) OVER (PARTITION BY cdreseau, famille ORDER BY jour) AS suivant FROM d)
        GROUP BY 1, 2""").fetchall()

    # Restrictions citant une cause, par réseau (conclusions de l'ARS classées par avis.charger).
    restr: dict[str, set[str]] = {}
    for cdreseau, cat, causes in con.execute(f"""
            SELECT DISTINCT a.cdreseau, t.cat, t.causes FROM avis_plv a JOIN avis_textes t USING (id)
            WHERE a.annee = {year} AND NOT t.local AND t.cat IN ('interdiction', 'ebullition')""").fetchall():
        for fam, liste in CAUSES_FAMILLE.items():
            if fam == "microbio" or cat == "interdiction":
                if any(c in (causes or "").split(",") for c in liste):
                    restr.setdefault(cdreseau, set()).add(fam)

    out: dict[str, dict[str, int]] = {}
    for cdreseau, fam, jours_dep, duree in jours:
        r = fam in restr.get(cdreseau, set())
        if fam == "pesticides":
            code = 0 if not jours_dep else (3 if r else 1 if (duree or 0) <= SEUIL_JOURS else 2)
        else:  # PFAS, métaux et minéraux : conformité simple
            code = 0 if not jours_dep else (2 if r else 1)
        out.setdefault(cdreseau, {})[fam] = code

    # Nitrates : classe de la concentration maximale de l'année (bilan national nitrates).
    for cdreseau, vmax in con.execute(f"""
            SELECT cdreseau, max(vmax) FROM read_parquet('{(AGG / str(year) / 'reseau_param.parquet').as_posix()}')
            WHERE cdparametre = '{NITRATES}' AND vmax IS NOT NULL GROUP BY 1""").fetchall():
        v = float(vmax)
        out.setdefault(cdreseau, {})["azote"] = sum(v > s for s in CLASSES_NITRATES)

    # Bactériologie : conformité des prélèvements (DIS_PLV.plvconformitebacterio), seuil de 95 %.
    for cdreseau, nc, ne in con.execute(f"""
            SELECT cdreseau, sum(nc_bact), sum(ne_bact) FROM read_parquet('{(AGG / str(year) / 'reseau_plv.parquet').as_posix()}')
            GROUP BY 1 HAVING sum(ne_bact) > 0""").fetchall():
        nc, ne = int(nc or 0), int(ne or 0)
        code = 0 if nc == 0 else (1 if (ne - nc) / ne >= SEUIL_BACT else 2)
        if "microbio" in restr.get(cdreseau, set()):
            code = 3
        out.setdefault(cdreseau, {})["microbio"] = code
    return out


def toutes(par_famille: dict[str, int]) -> int:
    """0 conforme pour toutes les familles, 1 non conforme pour au moins une, 2 restriction ou consigne."""
    if any(restriction(f, c) for f, c in par_famille.items()):
        return 2
    return 1 if any(non_conforme(f, c) for f, c in par_famille.items()) else 0


def code_chaine(par_famille: dict[str, int]) -> str:
    return "".join(str(par_famille[f]) if f in par_famille else "-" for f in FAMILLES)


def build(con: duckdb.DuckDBPyConnection, years: list[int]) -> dict[int, dict[str, str]]:
    """Écrit situations/<année>.json et renvoie, par année, le code de chaque réseau (pour les communes)."""
    codes: dict[int, dict[str, str]] = {}
    serie: dict[str, dict] = {}
    serie_depts: dict[str, dict] = {}
    for y in years:
        if not (C.OUT / "dis" / str(y) / "result.parquet").exists():
            continue
        par_reseau = situations_annee(con, y)
        info = dict(con.execute(f"""
            SELECT cdreseau, any_value(cddept) FROM read_parquet('{(AGG / str(y) / 'reseau_info.parquet').as_posix()}') GROUP BY 1""").fetchall())
        depts: dict[str, dict[str, list[int]]] = {}
        national = {f: [0, 0, 0, 0] for f in [*FAMILLES, "toutes"]}
        for cdreseau, fams in par_reseau.items():
            d = _dept(info.get(cdreseau), cdreseau)
            for fam, code in [*fams.items(), ("toutes", toutes(fams))]:
                depts.setdefault(d, {}).setdefault(fam, [0, 0, 0, 0])[code] += 1
                national[fam][code] += 1
        codes[y] = {r: code_chaine(f) for r, f in par_reseau.items()}
        _dump(C.WEB_DATA / "situations" / f"{y}.json", {"familles": FAMILLES, "reseaux": codes[y], "depts": depts, "national": national})
        serie[str(y)] = national
        serie_depts[str(y)] = depts
        print(f"  situations {y} : {len(par_reseau)} réseaux ; " + " ; ".join(f"{f} {national[f]}" for f in [*FAMILLES, "toutes"]))
    # Série nationale, pour les graphiques d'évolution (léger : sans les codes de réseaux). Les millésimes non
    # reconstruits cette fois (`robinet avis -y 2026`) gardent leur série.
    chemin = C.WEB_DATA / "situations" / "national.json"
    anciens = json.loads(chemin.read_text(encoding="utf-8")) if chemin.exists() else {}
    _dump(chemin, dict(sorted((anciens | serie).items())))
    ecrire_depts(serie_depts)
    return codes


def ecrire_depts(depts_par_annee: dict[str, dict]) -> None:
    """situations/depts.json : répartitions par département et par famille, pour chaque année. Les années
    reconstruites remplacent les leurs et les autres restent, pour qu'une reconstruction d'une seule année n'efface
    pas le reste (même règle que la série nationale). Les fichiers annuels (480 Ko, surtout les codes des réseaux)
    restent aux pages qui en ont besoin."""
    chemin = C.WEB_DATA / "situations" / "depts.json"
    anciens = json.loads(chemin.read_text(encoding="utf-8")) if chemin.exists() else {}
    _dump(chemin, dict(sorted((anciens | depts_par_annee).items())))


def pire_par_commune(con: duckdb.DuckDBPyConnection, year: int, codes: dict[str, str]) -> dict[str, str]:
    """Situation la plus défavorable, par famille, des réseaux qui desservent chaque commune (codes ordonnés)."""
    par_com: dict[str, list[int]] = {}
    for insee, cdreseau in con.execute(f"SELECT inseecommune, cdreseau FROM com_reseau WHERE annee = {year}").fetchall():
        c = codes.get(cdreseau)
        if c is None:
            continue
        cur = par_com.setdefault(insee, [-1] * len(FAMILLES))
        for i, ch in enumerate(c):
            if ch != "-":
                cur[i] = max(cur[i], int(ch))
    return {insee: "".join("-" if v < 0 else str(v) for v in vals) for insee, vals in par_com.items()}

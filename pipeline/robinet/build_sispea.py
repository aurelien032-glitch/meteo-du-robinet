"""Agrégats SISPEA (services d'eau potable) → fichiers statiques du site.

Sorties :
  sispea/national.json     par année : prix, rendement, renouvellement, pertes, par mode de gestion, par département,
                           plus la série longue 2008-2019 issue de l'API Hub'Eau
  sispea/dept/<dd>.json    par commune et par année : service, mode de gestion, opérateur, indicateurs
  sispea/communes/<an>.json  vue communale de /carte : service de chaque commune, valeurs de ses indicateurs
  sispea/services/<dd>.json  fiche de chaque service, au département de sa dernière déclaration, à défaut de sa
                           composition (fiches_services) ; sispea/services-index.json dit où la lire
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path

import duckdb

from . import config as C
from .util import arrondi
from .util import dept_of_insee as _dept_of_insee
from .util import dump as _dump
from .sispea import INDICATEURS

IND_MAIN = ["D101.0", "D102.0", "P101.1", "P102.1", "P103.2B", "P104.3", "P105.3", "P106.3", "P107.2", "P108.3",
            "P151.1", "P152.1", "P153.2", "P154.0", "P155.1"]

GESTION_SQL = """CASE WHEN lower(strip_accents(coalesce(mode_gestion, ''))) LIKE 'regie%' THEN 'regie'
                      WHEN lower(strip_accents(coalesce(mode_gestion, ''))) LIKE 'delegation%' THEN 'delegation'
                      ELSE NULL END"""

# Déclaration qui porte des indicateurs (prix ou rendement) : celle qui date la fiche d'un service (`annee_ind`).
DECLARATION_SQL = '("D102.0" IS NOT NULL OR "P104.3" IS NOT NULL)'


def _n(x, d: int = 2):
    return arrondi(x, d)


# Vue communale de /carte (demande de l'auteur, 2026-09-24) : colonnes des services de sispea/communes/<an>.json,
# relues par web/src/lib/servicesCommunes.ts et contrôlées par web/scripts/verifier-donnees.mjs.
COLONNES_CARTE = ["nom", "entite", "mode", "prix", "rend", "renouv", "protection", "conso", "pertes"]


def _num(x) -> float | None:
    return None if x is None or (isinstance(x, float) and x != x) else float(x)


def _positif(x) -> float | None:
    """Prix ou rendement déclaré : zéro vaut absence de déclaration (relecture du 24/09 : 79 communes à « 0,00 €/m³ »,
    39 à un rendement nul en 2024), sans quoi la carte les classerait parmi les moins chers ou les plus fuyards."""
    v = _num(x)
    return v if v is not None and v > 0 else None


def _texte(v) -> str | None:
    """Texte réellement renseigné, sinon None : la SISPEA remplit certains champs d'un simple point (lib/sispea.ts)."""
    t = v.strip() if isinstance(v, str) else ""
    return t if re.search(r"[^\W_]", t) else None


def _mode(v) -> str | None:
    """« r » (régie) ou « d » (délégation) d'après le début du libellé, accents et casse ignorés, comme GESTION_SQL."""
    t = "".join(c for c in unicodedata.normalize("NFD", v if isinstance(v, str) else "") if not unicodedata.combining(c))
    t = t.strip().lower()
    return "r" if t.startswith("regie") else "d" if t.startswith("delegation") else None


def conso_l_hab_j(vp063, d101) -> float | None:
    """Consommation domestique d'un service en litres par habitant et par jour, comme build_ressource la calcule par
    département (VP.063 / D101.0). Un volume vendu nul vaut absence de déclaration : « 0 L/hab/j » n'existe pas."""
    v, pop = _num(vp063), _num(d101)
    return 1000 * v / pop / 365 if v and pop and v > 0 and pop > 0 else None


# Déclaration de volumes invraisemblable, écartée des fuites (choix de l'auteur, 2026-09-25) quand deux signes
# concordent : plus de 1 500 L mis en distribution par habitant et par jour (près de sept fois la moyenne) ET plus de
# la moitié de cette eau perdue. Un seul signe ne suffit pas : une station de montagne distribue beaucoup par résident,
# un réseau rural peut vraiment perdre la moitié de son eau. En 2024, Vallée Sud Grand Paris déclarait 288 millions de
# m³ produits pour 411 601 habitants (1 522 L/hab/j, 73 % « perdus ») : la part nationale passait de 20,2 à 22,6 %.
FUITES_L_HAB_J_MAX = 1500
FUITES_PART_MAX = 0.5
_DISTRIB_SQL = 'coalesce("VP.059", 0) + coalesce("VP.060", 0) - coalesce("VP.061", 0)'
_CONSO_SQL = '"VP.063" + "VP.201" + coalesce("VP.220", 0) + coalesce("VP.221", 0)'
# La même règle en SQL, sur les colonnes de services.parquet (build_ressource aussi) ; une population inconnue ne
# condamne pas une déclaration.
VOLUMES_PLAUSIBLES_SQL = (f'NOT coalesce(1000 * ({_DISTRIB_SQL}) / 365 > {FUITES_L_HAB_J_MAX} * coalesce("D101.0", pop_desservie) '
                          f'AND ({_DISTRIB_SQL}) - ({_CONSO_SQL}) > {FUITES_PART_MAX} * ({_DISTRIB_SQL}), false)')


def volumes_invraisemblables(distrib: float, conso: float, pop) -> bool:
    """Les deux signes d'une déclaration invraisemblable concordent-ils (FUITES_L_HAB_J_MAX, FUITES_PART_MAX) ?"""
    p = _num(pop)
    return bool(p and p > 0 and 1000 * distrib / 365 > FUITES_L_HAB_J_MAX * p and distrib - conso > FUITES_PART_MAX * distrib)


def pertes_pct(vp059, vp060, vp061, vp063, vp201, vp220, vp221, pop=None) -> float | None:
    """Part de l'eau mise en distribution perdue par un service, en %, comme build_ressource par département :
    (produit + importé − exporté − consommé) / (produit + importé − exporté). Rien sans les volumes vendus (VP.063,
    VP.201), ni quand la consommation est nulle (100 % de « pertes ») ou dépasse l'eau distribuée, ni pour une
    déclaration invraisemblable (volumes_invraisemblables ; `pop` : habitants desservis)."""
    v063, v201 = _num(vp063), _num(vp201)
    if v063 is None or v201 is None:
        return None
    distrib = (_num(vp059) or 0) + (_num(vp060) or 0) - (_num(vp061) or 0)
    conso = v063 + v201 + (_num(vp220) or 0) + (_num(vp221) or 0)
    if volumes_invraisemblables(distrib, conso, pop):
        return None
    return 100 * (distrib - conso) / distrib if 0 < conso < distrib else None


def communes_carte(rows: list, volumes: dict) -> dict[int, dict]:
    """Par année : service de chaque commune — les lignes de sispea/dept, donc le même service — et, par service, ses
    valeurs dans l'ordre de COLONNES_CARTE. `rows` : lignes de service_des_communes (insee, année, service, nom de
    l'entité, collectivité, mode, …, puis IND_MAIN à partir de la 12e colonne) ; `volumes` : (service, année) →
    (consommation, pertes)."""
    par_annee: dict[int, dict] = {}
    for r in rows:
        insee, annee, sid, nom, coll, mode = r[:6]
        if not sid:
            continue
        a = par_annee.setdefault(annee, {"services": {}, "communes": {}})
        a["communes"][insee] = sid
        if sid in a["services"]:
            continue
        ind = dict(zip(IND_MAIN, r[11:]))
        conso, pertes = volumes.get((sid, annee), (None, None))
        coll_t = _texte(coll)
        # Même nettoyage que l'index de recherche (recherche._entite) : « eau potable » seul ne dit rien. L'entité ne
        # s'affiche qu'à côté d'une collectivité qui ne la contient pas déjà (« CC Bretagne Romantique (CCBR) »).
        entite = _texte(re.sub(r"^\s*eau potable\s*:?\s*", "", nom or "", flags=re.IGNORECASE))
        a["services"][sid] = [
            coll_t or entite,
            entite if coll_t and entite and entite.lower() not in coll_t.lower() else None,
            _mode(mode),
            _n(_positif(ind["D102.0"])), _n(_positif(ind["P104.3"]), 1), _n(_num(ind["P107.2"])), _n(_num(ind["P108.3"]), 1),
            round(conso) if conso is not None and round(conso) > 0 else None, _n(pertes, 1),
        ]
    return par_annee


def services_declares(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Chaque service de la vue `s`, décrit par UNE déclaration : celle de ses indicateurs (`annee_ind`), à défaut la
    dernière. Nom, collectivité, mode, exploitant, statut et population en viennent : l'année en cours ouvre une ligne
    « En attente de saisie » pour presque tous les services (9 850 en 2026), et `arg_max(…, annee)` champ par champ y
    prenait nom, mode et exploitant sous un badge « SISPEA 2024 » — la fiche de la CEBR s'appelait « 01-Rennes » quand
    ses communes et ses réseaux disent « 01-Rennes-St Jacques » (relecture du 25/09 ; 761 noms, 1 483 modes et 1 318
    exploitants concernés au 26/09). Le département reste celui de la dernière déclaration, qui situe mieux le service
    (fil d'Ariane, fichier par département) : pour 18 des 21 services qu'il déplacerait, dont les périmètres du SDEA
    dans le Haut-Rhin, la déclaration des indicateurs donne le siège de la collectivité et non celui des communes."""
    ligne = "struct_pack(nom := nom_service, coll := nom_coll, mode := mode_gestion, op := nom_operateur, statut := statut, pop := pop)"
    champs = ", ".join(f'"{i}" := "{i}"' for i in IND_MAIN)
    ind = f"struct_pack({champs})"
    out: dict[str, dict] = {}
    for sid, d, dept, annee, valeurs in con.execute(f"""
            SELECT id_service,
                   coalesce(arg_max({ligne}, annee) FILTER (WHERE {DECLARATION_SQL}), arg_max({ligne}, annee)),
                   arg_max(dept, annee),
                   max(annee) FILTER (WHERE {DECLARATION_SQL}),
                   arg_max({ind}, annee) FILTER (WHERE {DECLARATION_SQL})
            FROM s WHERE id_service IS NOT NULL GROUP BY 1 ORDER BY 1""").fetchall():
        out[sid] = {"nom": d["nom"], "coll": d["coll"], "dept": dept, "mode": d["mode"], "op": d["op"],
                    "statut": d["statut"], "pop": _n(d["pop"], 0), "annee_ind": annee,
                    "ind": {k: _n(v) for k, v in (valeurs or {}).items() if v is not None and v == v}}
    return out


def service_des_communes(con: duckdb.DuckDBPyConnection) -> list[tuple]:
    """Le service de chaque commune et de chaque année, d'après la composition (vue `c`) et les déclarations (vue `s`,
    une ligne par service et par année) : insee, année, service, nom de l'entité, collectivité, mode, exploitant,
    population du service, population de la commune, secteur, statut, puis IND_MAIN ; triées par commune et par année.
    Une commune adhère souvent à plusieurs entités (production, transfert, distribution) : on retient celle qui porte
    le prix, sinon le rendement, sinon celle qui distribue, sinon la plus peuplée. Le reste de l'ordre ne fait que
    départager, sur chaque colonne de `c` reprise dans la sortie : la composition rattache parfois une commune deux fois
    au même service, un secteur par ligne (50142 en 2020), et sans ordre total le choix changeait d'une exécution à
    l'autre (dept/50.json, constat du 27/09)."""
    ind_cols = ", ".join(f's."{i}"' for i in IND_MAIN)
    return con.execute(f"""
        SELECT c.insee, c.annee, c.id_service, coalesce(s.nom_service, c.nom_service), coalesce(s.nom_coll, c.nom_coll),
               coalesce(s.mode_gestion, c.mode_gestion), coalesce(s.nom_operateur, c.nom_operateur), s.pop, c.population,
               c.secteur, c.statut_donnees, {ind_cols}
        FROM c LEFT JOIN s ON s.id_service = c.id_service AND s.annee = c.annee
        WHERE c.insee IS NOT NULL
        QUALIFY row_number() OVER (PARTITION BY c.insee, c.annee
                                   ORDER BY (s."D102.0" IS NOT NULL) DESC, (s."P104.3" IS NOT NULL) DESC,
                                            (c.distribution = 'Oui') DESC, s.pop DESC NULLS LAST, c.id_service,
                                            c.population DESC NULLS LAST, c.secteur NULLS LAST,
                                            c.statut_donnees NULLS LAST, c.nom_service NULLS LAST, c.nom_coll NULLS LAST,
                                            c.mode_gestion NULLS LAST, c.nom_operateur NULLS LAST) = 1
        ORDER BY 1, 2""").fetchall()


def fiches_services(rows: list, declares: dict[str, dict]) -> dict[str, dict]:
    """Fiches des services (sispea/services/<dd>.json) : communes de la dernière composition où le service est celui
    d'au moins une commune (`rows`, lignes de service_des_communes), puis sa déclaration (`declares`, services_declares).

    Un service de la composition qui n'a jamais rien déclaré (3 au 27/09, dont 351134, CA Privas Centre Ardèche, en
    2025) n'avait que ses communes : fiche sans nom ni département, rangée dans « 00 », que le site ne savait pas
    ouvrir. La composition le décrit : collectivité, entité, mode, exploitant et statut de sa commune la plus peuplée,
    département de celle-ci, comme l'index de la recherche (recherche.index_services) et comme « Qui la distribue ? »
    le montre déjà sur ses communes. `sans_declaration` le signale au site, qui ne lui cherche ni prix ni indicateur."""
    par_annee: dict[str, dict[int, list]] = {}
    for r in rows:
        if r[2]:
            par_annee.setdefault(r[2], {}).setdefault(r[1], []).append(r)
    # Services de la composition d'abord, dans l'ordre des lignes, puis les autres déclarants : l'ordre des fichiers
    # publiés ne bouge pas d'une version à l'autre du code.
    services: dict[str, dict] = {sid: {} for sid in par_annee}
    for sid, d in declares.items():
        services.setdefault(sid, {}).update(d)
    for sid, annees in par_annee.items():
        last = max(annees)
        s = services[sid]
        s["annee_communes"] = last
        s["communes"] = sorted({r[0] for r in annees[last]})
        if sid not in declares:
            # Lignes de service_des_communes : insee, année, service, entité, collectivité, mode, exploitant, habitants
            # desservis, population de la commune, secteur, statut. Rangées par commune : à population égale, la première.
            r = max(annees[last], key=lambda r: r[8] or 0)
            s.update(nom=r[3], coll=r[4], dept=_dept_of_insee(r[0]), mode=r[5], op=r[6], statut=r[10],
                     sans_declaration=True)
    return services


def api_history_to_parquet() -> Path | None:
    """Historique 2008-2019 : l'instantané figé du dépôt (C.SISPEA_HISTORIQUE_FIGE). L'API Hub'Eau qui le servait est
    retirée (HTTP 410, 28/09/2026) ; l'instantané reproduit ligne pour ligne son dernier cache (816 768 lignes, vérifié
    le 04/10/2026), qui n'est plus relu."""
    return C.SISPEA_HISTORIQUE_FIGE if C.SISPEA_HISTORIQUE_FIGE.exists() else None


def _stats_sql(ind: str, alias: str) -> str:
    col = f'"{ind}"'
    return (f"quantile_cont({col}, 0.5) AS {alias}_p50, quantile_cont({col}, 0.1) AS {alias}_p10, "
            f"quantile_cont({col}, 0.9) AS {alias}_p90, "
            f"CAST(sum(CAST({col} * pop AS DECIMAL(38,10))) FILTER (WHERE {col} IS NOT NULL AND pop IS NOT NULL) AS DOUBLE) "
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
    # Tout ce qui suit tient pour acquise une déclaration par service et par année (arg_max(…, annee), choix du service
    # d'une commune, volumes) : sur un Parquet écrit avant sispea.dedoublonner, la sortie changerait d'une exécution à
    # l'autre sans rien signaler.
    doubles = con.execute("SELECT count(*) - count(DISTINCT (id_service, annee)) FROM s WHERE id_service IS NOT NULL").fetchone()[0]
    if doubles:
        raise RuntimeError(f"services.parquet : {doubles} déclaration(s) en double pour un même service et une même année ; "
                           "relancer `sispea.to_parquet()`, qui les départage (sispea.dedoublonner)")
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

    # Chaque GROUP BY qui remplit un dictionnaire est trié : sans ORDER BY, DuckDB rend les groupes dans un ordre qui
    # change d'une exécution à l'autre, et les clés des fichiers JSON avec.
    out: dict = {"annees": {}, "gestion": {}, "depts": {}, "serie_api": {}}
    for row in con.execute(f"SELECT annee, count(*), sum(pop), {stats} FROM s GROUP BY 1 ORDER BY 1").fetchall():
        out["annees"][row[0]] = {"n": row[1], "pop": _n(row[2], 0), **unpack(row, 3)}
    for row in con.execute(f"SELECT annee, gestion, count(*), sum(pop), {stats} FROM s WHERE gestion IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2").fetchall():
        out["gestion"].setdefault(row[0], {})[row[1]] = {"n": row[2], "pop": _n(row[3], 0), **unpack(row, 4)}
    for row in con.execute(f"""
            SELECT dept, annee, count(*), sum(pop),
                   sum(pop) FILTER (WHERE gestion = 'delegation') / nullif(sum(pop) FILTER (WHERE gestion IS NOT NULL), 0),
                   {stats}
            FROM s WHERE dept IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2""").fetchall():
        out["depts"].setdefault(row[0], {})[row[1]] = {"n": row[2], "pop": _n(row[3], 0), "part_pop_delegation": _n(row[4], 3),
                                                     **unpack(row, 5)}
    # Part de l'eau mise en distribution perdue, sur les volumes déclarés, pour chaque année : le calcul de la page
    # Ressource (build_ressource, mêmes services et mêmes volumes). Choix de l'auteur, 24/09 : un seul chiffre des
    # fuites sur tout le site, là où /services affichait 100 moins le rendement ; 25/09 : sans les déclarations
    # invraisemblables (VOLUMES_PLAUSIBLES_SQL).
    for annee, distrib, conso in con.execute(f"""
            SELECT annee,
                   CAST(sum(CAST({_DISTRIB_SQL} AS DECIMAL(38,10)))
                       FILTER (WHERE "VP.063" IS NOT NULL AND "VP.201" IS NOT NULL AND {VOLUMES_PLAUSIBLES_SQL}) AS DOUBLE),
                   CAST(sum(CAST({_CONSO_SQL} AS DECIMAL(38,10)))
                       FILTER (WHERE "VP.063" IS NOT NULL AND "VP.201" IS NOT NULL AND {VOLUMES_PLAUSIBLES_SQL}) AS DOUBLE)
            FROM s WHERE dept IS NOT NULL GROUP BY 1 ORDER BY 1""").fetchall():
        if annee in out["annees"]:
            out["annees"][annee]["pertes_vol"] = _n(100 * (distrib - conso) / distrib, 1) if distrib and conso and distrib > conso else None

    hist = api_history_to_parquet()
    if hist:
        con.execute(f"CREATE VIEW h AS SELECT * FROM read_parquet('{hist.as_posix()}')")
        for annee, ind, p50, p10, p90, n in con.execute("""
                SELECT annee, code_indicateur, quantile_cont(valeur, 0.5), quantile_cont(valeur, 0.1), quantile_cont(valeur, 0.9), count(valeur)
                FROM h WHERE valeur IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2""").fetchall():
            out["serie_api"].setdefault(annee, {})[ind] = {"p50": _n(p50), "p10": _n(p10), "p90": _n(p90), "n": n}
    out["indicateurs"] = INDICATEURS
    _dump(C.WEB_DATA / "sispea" / "national.json", out)

    if not has_comp:
        raise RuntimeError("composition.parquet absent : lancer `sispea.composition_to_parquet()` avant `build_sispea.run()`")
    rows = service_des_communes(con)
    by_dept: dict[str, dict] = {}
    for r in rows:
        insee, annee, sid, nom, coll, mode, op, pop, pop_com, secteur, statut = r[:11]
        ind = {code: _n(v) for code, v in zip(IND_MAIN, r[11:]) if v is not None and v == v}
        by_dept.setdefault(_dept_of_insee(insee), {}).setdefault(insee, {})[annee] = {
            "id": sid, "nom": nom, "coll": coll, "mode": mode, "op": op, "pop": _n(pop, 0), "pop_com": _n(pop_com, 0),
            "secteur": secteur, "statut": statut, "ind": ind}
    for dept, communes in by_dept.items():
        _dump(C.WEB_DATA / "sispea" / "dept" / f"{dept}.json", communes)

    # Vue communale de /carte : consommation et fuites recalculées service par service, sur les volumes déclarés.
    volumes = {(sid, an): (conso_l_hab_j(v063, d101), pertes_pct(v059, v060, v061, v063, v201, v220, v221, pop))
               for sid, an, d101, pop, v059, v060, v061, v063, v201, v220, v221 in con.execute("""
                   SELECT id_service, annee, "D101.0", pop, "VP.059", "VP.060", "VP.061", "VP.063", "VP.201", "VP.220", "VP.221"
                   FROM s WHERE id_service IS NOT NULL""").fetchall()}
    for annee, a in sorted(communes_carte(rows, volumes).items()):
        _dump(C.WEB_DATA / "sispea" / "communes" / f"{annee}.json", {"annee": str(annee), "colonnes": COLONNES_CARTE, **a})

    # Fiches des services (vue par collectivité) : dernière année où le service a des communes rattachées,
    # déclaration qui date ses indicateurs, ou composition faute de toute déclaration.
    services = fiches_services(rows, services_declares(con))
    # Index léger (routage de la fiche) + détail par département. Le site lit le département dans l'index pour
    # charger la fiche : un service sans département n'y a pas de fichier, et sa fiche le dit (pages/Service.tsx).
    index = {sid: [s.get("coll") or s.get("nom"), s.get("dept"), s.get("pop"), s.get("mode"), s.get("nom")]
             for sid, s in services.items()}
    _dump(C.WEB_DATA / "sispea" / "services-index.json", index)
    by_dept_s: dict[str, dict] = {}
    for sid, s in services.items():
        if s.get("dept"):
            by_dept_s.setdefault(s["dept"], {})[sid] = s
    sans_dept = sorted(sid for sid, s in services.items() if not s.get("dept"))
    if sans_dept:
        print(f"  ! {len(sans_dept)} services sans département, fiche indisponible : {', '.join(sans_dept[:10])}")
    dossier = C.WEB_DATA / "sispea" / "services"
    for d, m in by_dept_s.items():
        _dump(dossier / f"{d}.json", m)
    # Fichiers d'un département qui n'a plus de service, dont l'ancien « 00 » des services sans déclaration.
    for f in dossier.glob("*.json"):
        if f.stem not in by_dept_s:
            f.unlink()
    old = C.WEB_DATA / "sispea" / "services.json"
    if old.exists():
        old.unlink()
    print(f"SISPEA terminé en {time.time() - t0:.0f}s")

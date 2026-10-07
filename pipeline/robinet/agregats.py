"""Étape 1 de la construction : agrégats d'un millésime du contrôle sanitaire (data/out/agg/<annee>/).

Rejouée seulement si l'agrégat manque, si son format a changé (AGG_VERSION) ou si l'archive DIS du millésime a été
republiée (dis.version_source) :
  plv.parquet            un prélèvement = une ligne (le fichier DIS_PLV en contient une par réseau desservi)
  reseau_param.parquet   par réseau × paramètre : analyses, dépassements, max, moyenne, dernière valeur
  dept_param.parquet     par département × paramètre
  reseau_plv.parquet     par réseau : prélèvements et conformités
  reseau_info.parquet    nom, distributeur, département de chaque réseau
  com_udi.parquet        communes ↔ réseaux du millésime
  params.parquet         catalogue des paramètres du millésime
  *_month_param.parquet  séries mensuelles (national, département, réseau)
"""
from __future__ import annotations

import os
import time

import duckdb

from . import config as C
from . import dis
from .themes import FAMILY_CASE, FAMILY_PRIORITY, depasse, limite_qualite, resultats_juges
from .themes import borne as _bound
from .util import sql_modes

AGG = C.OUT / "agg"
# Version du format des agrégats d'un millésime, écrite dans la sentinelle `.complete` : un agrégat d'une version
# antérieure est reconstruit, même sans --force. Le rafraîchissement hebdomadaire ne force que l'année en cours ; sans
# ce numéro, les années précédentes garderaient en cache un agrégat produit par un code plus ancien.
# 2 (2026-10-03) : séries mensuelles par réseau pour toutes les familles jugées sauf la bactériologie.
# 3 (2026-10-04) : libellés de paramètres déterministes ; plv.parquet écrit avec les agrégats.
# 4 (2026-10-04) : dernière valeur déterministe (à date égale, la plus haute).
# 5 (2026-10-04) : moyennes en DECIMAL, exactes (l'ordre des additions parallèles changeait le dernier chiffre) ;
#     valeurs les plus fréquentes départagées (util.sql_modes), informations d'un réseau lues sur ses propres lignes.
# La sentinelle porte aussi la version de l'archive DIS (dis.version_source) : une archive republiée refait l'agrégat.
# 6 (2026-10-04) : somme des HAP (2033) rangée parmi les organiques, et non plus parmi les pesticides (themes.ORGANIQUES).
# 7 (2026-10-05) : total des pesticides jugé sans les métabolites non pertinents qu'il inclut (themes.resultats_juges).
# 8 (2026-10-05) : ESA-métolachlore, diméthénamide ESA (2022) et AMPA (2025) ajoutés aux métabolites non pertinents.
# 9 (2026-10-05) : métabolites non pertinents du total lus combinaison par combinaison ; total général 6276 seul.
AGG_VERSION = 9
# Familles suivies mois par mois au niveau de chaque réseau (fiches commune et réseau). La bactériologie n'y figure
# pas : sa limite est zéro, des maxima mensuels n'en disent rien d'utile.
SERIES_FAMILLES = ("pesticides", "azote", "pfas", "metaux_mineraux", "organiques", "physico_chimie")


def agregat_a_jour(year: int) -> bool:
    """Agrégats du millésime complets, produits par la version courante du code (AGG_VERSION) et depuis l'archive DIS
    présente (dis.version_source ; sans archive, la seule version du code compte)."""
    sentinelle = AGG / str(year) / ".complete"
    if not sentinelle.exists():
        return False
    lu = sentinelle.read_text(encoding="utf-8").split()
    source = dis.version_source(year)
    return lu[:1] == [str(AGG_VERSION)] and (source is None or lu[1:2] == [source])


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    tmp = C.CACHE / "duckdb_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    # 8 Go sur le poste ; la machine du rafraîchissement automatique (GitHub Actions, dépôt privé) en a environ 7 : elle
    # règle ROBINET_DUCKDB_MEMORY, et DuckDB déborde sur le disque (temp_directory) au-delà.
    memoire = os.environ.get("ROBINET_DUCKDB_MEMORY", "8GB")
    con.execute(f"SET memory_limit='{memoire}'")
    con.execute(f"SET temp_directory='{tmp.as_posix()}'")
    con.execute("SET preserve_insertion_order=false")
    return con


# ----------------------------------------------------------------------------------------------
# Étape 1 : agrégats d'un millésime
# ----------------------------------------------------------------------------------------------

def aggregate_year(con: duckdb.DuckDBPyConnection, year: int, *, force: bool = False) -> None:
    out = AGG / str(year)
    # Sentinelle dédiée, écrite en tout dernier (après les 11 COPY qui suivent) plutôt que l'existence d'un
    # fichier intermédiaire quelconque : un run interrompu en cours de route (Ctrl-C, mise en veille, tâche
    # planifiée tuée) laissait alors un répertoire d'année incomplet ou tronqué que le run suivant prenait
    # pour un agrégat valide et ne retentait jamais. Elle porte la version du format (AGG_VERSION).
    if agregat_a_jour(year) and not force:
        print(f"  = agrégats {year} présents")
        return
    if (out / ".complete").exists() and not force:
        print(f"  agrégats {year} d'un format antérieur ou d'une archive précédente : reconstruction")
    paths = dis.to_parquet(year)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    plv, result, com_udi = paths["plv"].as_posix(), paths["result"].as_posix(), paths["com_udi"].as_posix()

    con.execute(f"""
        CREATE OR REPLACE TABLE plv AS
        SELECT referenceprel,
               min(cddept) AS cddept,
               min(inseecommuneprinc) AS insee_princ,
               min(dateprel) AS dateprel,
               CAST(substr(min(dateprel), 1, 4) AS INTEGER) AS annee,
               min(plvconformitebacterio) AS c_bact, min(plvconformitechimique) AS c_chim,
               min(plvconformitereferencebact) AS r_bact, min(plvconformitereferencechim) AS r_chim
        FROM read_parquet('{plv}') GROUP BY referenceprel""")
    con.execute(f"""
        CREATE OR REPLACE TABLE plv_reseau AS
        SELECT DISTINCT referenceprel, cdreseau FROM read_parquet('{plv}')
        WHERE cdreseau IS NOT NULL AND cdreseau <> ''""")

    con.execute(f"""
        CREATE OR REPLACE TABLE res AS
        WITH r0 AS (
            SELECT r.referenceprel, r.cdparametre, r.valtraduite AS val, r.val_jugee,
                   {FAMILY_CASE} AS famille,
                   {_bound(limite_qualite('r.limitequal', 'p.annee', 'r.cdparametre'), '<=')} AS lim_max,
                   {_bound(limite_qualite('r.limitequal', 'p.annee', 'r.cdparametre'), '>=')} AS lim_min,
                   {_bound('r.refqual', '<=')} AS ref_max, {_bound('r.refqual', '>=')} AS ref_min,
                   p.annee, p.dateprel, p.cddept
            FROM ({resultats_juges(result, year)}) r JOIN plv p USING (referenceprel))
        SELECT * EXCLUDE (val_jugee),
               {depasse('val_jugee', 'lim_max', 'lim_min')} AS dep_lim,
               {depasse('val', 'ref_max', 'ref_min')} AS dep_ref
        FROM r0""")
    # Famille décidée par paramètre (la plus spécifique observée dans l'année), pas par ligne : sinon un paramètre
    # dont la limite disparaît en cours d'année change de famille au hasard d'une construction à l'autre.
    con.execute(f"""
        CREATE OR REPLACE TABLE fam AS
        SELECT cdparametre, arg_min(famille, ({FAMILY_PRIORITY}, famille)) AS famille FROM res GROUP BY 1""")
    con.execute("CREATE OR REPLACE TABLE res2 AS SELECT r.* EXCLUDE (famille), f.famille FROM res r JOIN fam f USING (cdparametre)")
    con.execute("DROP TABLE res")
    con.execute("ALTER TABLE res2 RENAME TO res")
    print(f"  {year}: analyses enrichies en {time.time() - t0:.0f}s")

    con.execute(f"""
        COPY (SELECT pr.cdreseau, r.annee, r.cdparametre, any_value(r.famille) AS famille,
                     count(*) AS n, count(*) FILTER (WHERE r.dep_lim) AS n_dep, count(*) FILTER (WHERE r.dep_ref) AS n_ref,
                     count(*) FILTER (WHERE r.val > 0) AS n_quant, count(r.val) AS n_val,
                     max(r.val) AS vmax, avg(CAST(r.val AS DECIMAL(38,10))) AS vmean, arg_max(r.val, (r.dateprel, r.val)) AS vlast, max(r.dateprel) AS dlast
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
    # Département, distributeur, unité de gestion et maître d'ouvrage d'un réseau : les plus fréquents parmi SES lignes
    # de DIS_PLV (une ligne par prélèvement et par réseau desservi ; un prélèvement qui dessert plusieurs réseaux en
    # porte autant que de réseaux), ex æquo départagés par util.sql_modes.
    reseaux_plv = f"(SELECT * FROM read_parquet('{plv}') WHERE cdreseau IS NOT NULL AND cdreseau <> '')"
    modes = sql_modes(reseaux_plv, "cdreseau", {"cddept": "cddept", "distributeur": "distrlib", "uge": "ugelib", "moa": "moalib"})
    con.execute(f"""
        COPY (SELECT cdreseau, m.cddept, m.distributeur, m.uge, m.moa, {year} AS annee
              FROM (SELECT DISTINCT cdreseau FROM plv_reseau) r LEFT JOIN ({modes}) m USING (cdreseau))
        TO '{(out / 'reseau_info.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT inseecommune, nomcommune, quartier, cdreseau, nomreseau, debutalim, {year} AS annee
              FROM read_parquet('{com_udi}'))
        TO '{(out / 'com_udi.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT l.cdparametre, l.lib, m.unite, m.limitequal, m.refqual, m.cas, {year} AS annee
              FROM (SELECT cdparametre, min(libminparametre) AS lib FROM read_parquet('{result}') GROUP BY 1) l
              LEFT JOIN ({sql_modes(f"read_parquet('{result}')", "cdparametre",
                                    {"unite": "cdunitereferencesiseeaux", "limitequal": "nullif(limitequal, '')",
                                     "refqual": "nullif(refqual, '')", "cas": "casparam"})}) m USING (cdparametre))
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
                     avg(CAST(val AS DECIMAL(38,10))) AS vmean, quantile_cont(val, 0.5) AS p50, quantile_cont(val, 0.9) AS p90, max(val) AS vmax,
                     count(DISTINCT referenceprel) FILTER (WHERE dep_lim) AS n_plv_dep
              FROM res GROUP BY 1, 2, 3)
        TO '{(out / 'nat_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute(f"""
        COPY (SELECT cddept, annee, CAST(substr(dateprel, 6, 2) AS INTEGER) AS mois, cdparametre,
                     count(*) AS n, count(*) FILTER (WHERE dep_lim) AS n_dep, count(*) FILTER (WHERE val > 0) AS n_quant,
                     avg(CAST(val AS DECIMAL(38,10))) AS vmean, max(val) AS vmax
              FROM res GROUP BY 1, 2, 3, 4)
        TO '{(out / 'dept_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    # Séries mensuelles par réseau, familles jugées hors bactériologie (fiches commune et réseau ; le tri entre
    # paramètres publiés et écartés se fait dans build_series_reseaux).
    con.execute(f"""
        COPY (SELECT pr.cdreseau, r.annee, CAST(substr(r.dateprel, 6, 2) AS INTEGER) AS mois, r.cdparametre,
                     any_value(r.famille) AS famille,
                     count(*) AS n, count(*) FILTER (WHERE r.dep_lim) AS n_dep, count(*) FILTER (WHERE r.val > 0) AS n_quant,
                     max(r.val) AS vmax
              FROM res r JOIN plv_reseau pr USING (referenceprel)
              WHERE r.famille IN {SERIES_FAMILLES} GROUP BY 1, 2, 3, 4)
        TO '{(out / 'reseau_month_param.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    con.execute("DROP TABLE res")
    # Prélèvements du millésime pour l'étape 2 (taux des cartes), tirés de la même table que les agrégats.
    con.execute(f"""
        COPY (SELECT referenceprel, cddept, insee_princ, dateprel, annee, c_bact, c_chim, r_bact, r_chim FROM plv)
        TO '{(out / 'plv.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    (out / ".complete").write_text(f"{AGG_VERSION} {dis.version_source(year) or '-'} {time.strftime('%Y-%m-%dT%H:%M:%S')}",
                                   encoding="utf-8")
    print(f"  {year}: agrégats écrits en {time.time() - t0:.0f}s")

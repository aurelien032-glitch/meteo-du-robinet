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

  PFAS, métaux et minéraux, autres limites — conformité à la limite de qualité (pas de bilan national par durée) :
    0  conforme   1  au moins une analyse au-dessus de la limite   2  restriction de consommation
    (Pour les PFAS, l'ARS ne retient la non-conformité qu'après confirmation sur deux saisons, par la
    médiane : le site dit « dépassement constaté », non « non-conformité avérée ». Leur limite ne s'applique
    qu'à partir de 2026 : avant, un dépassement est une réserve, pas une non-conformité — choix de l'auteur,
    2026-09-25 —, et seule la restriction de l'ARS compte dans « toutes familles ».)

  Autres limites de qualité (choix de l'auteur, 2026-10-03) : tous les autres paramètres que l'arrêté du 11 janvier
    2007 (annexe I, partie I) soumet à une limite de qualité — sous-produits de désinfection (trihalométhanes,
    chlorates, chlorites, acides haloacétiques), chlorure de vinyle, solvants chlorés, benzène, HAP, acrylamide,
    épichlorhydrine, bisphénol A, microcystines, cyanures, turbidité au point de mise en distribution, nitrates/50 +
    nitrites/3. L'indicateur global de l'ARS les retient tous ; les laisser de côté déclarait conformes 548 réseaux
    en 2025 qui ne l'étaient pas.

  Toutes familles — 0 conforme pour toutes, 1 non conforme pour au moins une, 2 restriction ou consigne.

  Classe A–D (« indicateur global de qualité » des synthèses annuelles de l'ARS jointes à la facture, depuis 2023 ;
  choix de l'auteur, 2026-10-03), défini par la note d'information DGS/EA4 du 19 juillet 2019 (article D.1321-104 du
  code de la santé publique) : classe la plus défavorable de l'ensemble des paramètres contrôlés ; A conformité dans
  l'année, B dépassement ponctuel sans risque pour la santé, C dépassements récurrents sous les seuils sanitaires,
  D dépassements des seuils sanitaires ayant donné lieu à des restrictions d'usage. Le détail par paramètre de
  l'annexe n'est pas publié en données ouvertes. Règles retenues, par
  famille : A conforme, réserves comprises (nitrates de 25 à 50 mg/L) ; B dépassements cumulés sur 30 jours au plus dans l'année (règle NC0 du bilan pesticides, étendue) ; C plus
  de 30 jours, ou eau déconseillée aux publics sensibles par l'ARS pour cette cause ; D restriction de consommation
  ou consigne d'ébullition. Deux exceptions, vérifiées sur 198 synthèses 2025 de l'ARS (choix de l'auteur, 2026-10-05) :
  la bactériologie suit la grille de l'indicateur (`lettre_bact` : derniers prélèvements, cinq ans au plus, taux de
  conformité et maximum d'E. coli ou d'entérocoques), et un dépassement de PFAS ne compte qu'une fois répété dans
  l'année (`JOURS_CONFIRMATION_PFAS`). La classe d'un réseau est celle de sa famille la plus défavorable ; une famille
  sans analyse dans l'année reprend la classe de sa dernière année analysée, cinq ans au plus (`reporter`). La classe
  du site est dite « calculée » : la synthèse de l'ARS fait foi.

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
import time
from pathlib import Path

import duckdb

from . import config as C
from .util import arrondi, dept_site, dump
from .themes import borne as _bound
from .themes import depasse, limite_qualite, resultats_juges

# Ordre des familles dans les codes de réseau et de commune (lu par le site : web/src/lib/situations.ts).
FAMILLES = ["pesticides", "azote", "pfas", "microbio", "metaux_mineraux", "autres"]
BINAIRES = ["pfas", "metaux_mineraux", "autres"]
# Familles du référentiel (themes.FAMILY_CASE) réunies dans « autres » : leurs paramètres à limite de qualité.
AUTRES = ("organiques", "physico_chimie")
# Hors du jugement d'un réseau, comme dans l'indicateur global de l'ARS (choix de l'auteur, 2026-10-03) ; ces résultats
# restent publiés dans le détail des analyses (lu par le site : CANALISATIONS et MATERIAUX de lib/situations.ts).
#  - paramètres liés aux canalisations : plomb, nickel, cuivre, mesurés au robinet. Infofactures : « Les résultats du
#    contrôle des paramètres de qualité liés aux canalisations ne sont pas pris en compte, dans la mesure où ils ne
#    sont pas représentatifs de la qualité de l'eau distribuée sur la zone concernée » ; la limite du plomb s'applique
#    en amont des installations privées (arrêté du 11 janvier 2007, annexe I).
CANALISATIONS = ("1382", "1386", "1392")
#  - paramètres liés aux matériaux des canalisations publiques et aux réactifs de traitement (2026-10-04) : chlorure
#    de vinyle (PVC), HAP et benzo(a)pyrène (revêtements bitumineux), acrylamide et épichlorhydrine (floculants, résines).
#    Exclus par la DGS du calcul de l'indicateur (avis du HCSP du 14/11/2018 sur le projet ; infofactures :
#    « paramètres de qualité liés aux canalisations »). Les HAP (4 substances), limite de 0,1 µg/L, étaient en outre
#    rangés parmi les pesticides (themes.ORGANIQUES, 2026-10-04).
MATERIAUX = ("1753", "2033", "1115", "1457", "1494")
# Classe d'une famille sans analyse dans l'année : celle de la dernière année analysée, cinq ans au plus (rapports
# annuels des ARS : « des résultats d'analyses des années antérieures, dans la limite de cinq années, peuvent être pris
# en compte […] si le nombre de résultats de l'année est insuffisant », cas des petites unités de distribution). La
# lettre reportée s'écrit en minuscule dans `classes` (le site le dit).
ANNEES_REPORT = 5
NITRATES = "1340"
# Nitrites : limite de qualité de l'arrêté du 11 janvier 2007 (0,50 mg/L au robinet, 0,10 mg/L en sortie de traitement,
# portée par chaque résultat). La classe des nitrates ne lit que le maximum des nitrates (bilan national) : les nitrites
# sont jugés avec les autres limites de qualité (choix de l'auteur, 2026-10-05 ; lu par le site : NITRITES).
NITRITES = "1339"
# Causes des conclusions de l'ARS (avis.CAUSES) qui valent restriction pour une famille.
CAUSES_FAMILLE = {
    "pesticides": ["pesticides"],
    "azote": ["nitrates"],
    "pfas": ["PFAS"],
    "metaux_mineraux": ["plomb", "arsenic", "sélénium", "aluminium", "fluorures", "manganèse"],
    "microbio": ["bactériologie"],
    "autres": ["turbidité", "chlorure de vinyle", "chlorites / chlorates", "trihalométhanes"],
}
SEUIL_JOURS = 30
SEUIL_BACT = 0.95
# Bactériologie, classe A–D : grille de l'indicateur global de l'ARS (publiée par l'ARS Provence-Alpes-Côte d'Azur,
# page « Eau du robinet » ; choix de l'auteur, 2026-10-05, après comparaison à 198 synthèses 2025 de toutes les régions :
# 183 lettres bactériologiques sur 197 identiques, contre 63 sur 126 avec la règle des 95 % et des 30 jours). Calcul
# sur les ANALYSES_BACT_MIN derniers prélèvements au moins, en années entières, de la plus récente vers les plus
# anciennes, cinq ans au plus (« Années prises en compte » des synthèses ; le site n'a ses données que depuis 2023) :
# taux de prélèvements conformes aux limites (E. coli, entérocoques) et maximum d'E. coli ou d'entérocoques. Une
# consigne d'ébullition ne vaut pas D d'office : les synthèses classent en C (Avène 034000755, 2025) ou en A
# (009001035) des réseaux qui en ont eu une ; la grille seule en rend compte.
GERMES = ("1449", "6455")  # Escherichia coli, entérocoques
ANALYSES_BACT_MIN = 10
MAX_GERMES = 5  # n/100 mL : à partir de ce maximum, C au mieux
# (prélèvements au moins, taux sous lequel D, taux à partir duquel A ; entre les deux, B), du plus grand effectif au
# plus petit ; un réseau qui n'atteint pas 10 prélèvements en cinq ans prend la dernière ligne.
GRILLE_BACT = ((100, 95, 99), (50, 95, 98), (20, 95, 95), (0, 90, 90))
# PFAS : l'ARS ne retient une non-conformité qu'après confirmation (instruction DGS/EA4/2025/22 du 19 février 2025) ; un
# seul jour au-dessus de la limite dans l'année laisse la classe A (synthèses 2025 : 3 cas sur 3 ; choix de l'auteur,
# 2026-10-05). Le résultat reste publié, et la famille « dépassement constaté » au bulletin.
JOURS_CONFIRMATION_PFAS = 2
CLASSES_NITRATES = (25.0, 40.0, 50.0)
# Les limites de la directive 2020/2184 (somme de 20 PFAS, chlorates, chlorites, acides haloacétiques, bisphénol A,
# uranium, chrome VI) s'appliquent depuis le 1er janvier 2023 ; seule leur recherche systématique commence en 2026
# (note d'information DGS/EA4/2023/61 du 14 avril 2023, fiche 3 ; choix de l'auteur, 2026-10-04, qui remplace la
# règle « au-dessus de la future limite » avant 2026). SISE-Eaux porte ces limites sur les résultats dès 2023.
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


def _dump(path: Path, obj) -> None:
    dump(path, obj, silencieux=True)


def _dept(cddept: str | None, cdreseau: str) -> str:
    """Département au format des contours (« 01 », « 2A », « 971 ») à partir du code SISE (« 001 », « 02A », « 971 »)."""
    return dept_site((cddept or cdreseau[:3] or "").strip())


def lettre(fam: str, code: int, duree: int, sensibles: bool) -> str:
    """Classe A–D d'une famille sur un réseau (en-tête du module). `duree` : jours cumulés de dépassement de la limite."""
    if restriction(fam, code):
        return "D"
    if not non_conforme(fam, code):
        return "A"
    return "C" if sensibles or duree > SEUIL_JOURS else "B"


def lettre_bact(n: int, nc: int, vmax: float) -> str:
    """Classe A–D de la bactériologie (GRILLE_BACT) : `n` prélèvements cumulés, `nc` non conformes, `vmax` maximum
    d'E. coli ou d'entérocoques (n/100 mL). Comparaisons en entiers : un taux de 95 % pile reste à 95 %."""
    _, seuil_d, seuil_a = next(g for g in GRILLE_BACT if n >= g[0])
    conformes = 100 * (n - nc)
    if conformes < seuil_d * n:
        return "D"
    if vmax >= MAX_GERMES:
        return "C"
    return "A" if conformes >= seuil_a * n else "B"


def bact_annee(con: duckdb.DuckDBPyConnection, year: int) -> dict[str, tuple[int, int, float]]:
    """Prélèvements bactériologiques d'une année par réseau : (prélèvements jugés, non conformes, maximum d'E. coli ou
    d'entérocoques). Vide si le millésime manque."""
    dis = C.OUT / "dis" / str(year)
    if not (dis / "plv.parquet").exists() or not (dis / "result.parquet").exists():
        return {}
    rows = con.execute(f"""
        WITH p AS (SELECT DISTINCT cdreseau, referenceprel, plvconformitebacterio AS conf
                   FROM read_parquet('{(dis / "plv.parquet").as_posix()}')
                   WHERE cdreseau IS NOT NULL AND cdreseau <> '' AND plvconformitebacterio IN ('C', 'N')),
             g AS (SELECT referenceprel, max(valtraduite) AS v FROM read_parquet('{(dis / "result.parquet").as_posix()}')
                   WHERE cdparametre IN {GERMES} GROUP BY 1)
        SELECT cdreseau, count(*), count(*) FILTER (WHERE conf = 'N'), coalesce(max(v), 0)
        FROM p LEFT JOIN g USING (referenceprel) GROUP BY 1""").fetchall()
    return {cd: (int(n), int(nc), float(v)) for cd, n, nc, v in rows}


def cumul_bact(par_an: dict[int, dict[str, tuple[int, int, float]]], cdreseau: str, annee: int) -> tuple[int, int, float, int] | None:
    """Prélèvements cumulés d'un réseau, de `annee` vers les années antérieures, jusqu'à ANALYSES_BACT_MIN (cinq ans au
    plus) : (prélèvements, non conformes, maximum, première année prise en compte) ; None sans prélèvement."""
    n = nc = 0
    vmax = 0.0
    debut = annee
    for a in range(annee, annee - ANNEES_REPORT, -1):
        x = par_an.get(a, {}).get(cdreseau)
        if x:
            n, nc, vmax, debut = n + x[0], nc + x[1], max(vmax, x[2]), a
        if n >= ANALYSES_BACT_MIN:
            break
    return (n, nc, vmax, debut) if n else None


def situations_annee(con: duckdb.DuckDBPyConnection, year: int,
                     bact_par_an: dict[int, dict[str, tuple[int, int, float]]] | None = None,
                     ) -> tuple[dict[str, dict[str, int]], dict[str, str], dict[str, list]]:
    """Code de situation par réseau et par famille pour une année, {cdreseau: {famille: code}}, lettres A–D de chaque
    réseau, {cdreseau: lettres dans l'ordre de FAMILLES, « - » pour une famille non analysée}, et prélèvements
    bactériologiques cumulés des réseaux dont la bactériologie n'est pas en A, {cdreseau: [prélèvements, non conformes,
    maximum, première année]}, lus par le site pour dire la cause de la classe. `bact_par_an` : bact_annee des années
    utiles, lu au besoin."""
    dis_dir = C.OUT / "dis" / str(year)
    result, plv = (dis_dir / "result.parquet").as_posix(), (dis_dir / "plv.parquet").as_posix()
    params = (AGG / str(year) / "params.parquet").as_posix()
    fams = ", ".join(f"'{f}'" for f in ["pesticides", *BINAIRES, *AUTRES])

    # Jours d'analyse par réseau et par famille : dépassement ce jour-là ou non (paramètres à limite seulement),
    # et durée cumulée des dépassements (pesticides, et classes A–D de toutes les familles). Les nitrates n'y entrent
    # que par leur propre limite (50 mg/L), pour la durée : leur classe vient de la concentration maximale.
    jours = con.execute(f"""
        WITH r AS (
            SELECT referenceprel, cdparametre, val_jugee AS val,
                   {_bound(limite_qualite('limitequal', str(year)), '<=')} AS lim_max,
                   {_bound(limite_qualite('limitequal', str(year)), '>=')} AS lim_min
            FROM ({resultats_juges(result, year)})),
        f AS (SELECT cdparametre,
                     CASE WHEN cdparametre = '{NITRATES}' THEN 'azote'
                          WHEN cdparametre = '{NITRITES}' THEN 'autres'
                          WHEN any_value(famille) IN ({", ".join(f"'{a}'" for a in AUTRES)}) THEN 'autres'
                          ELSE any_value(famille) END AS famille
              FROM read_parquet('{params}') GROUP BY 1
              HAVING any_value(famille) IN ({fams}) OR cdparametre IN ('{NITRATES}', '{NITRITES}')),
        p AS (SELECT referenceprel, any_value(dateprel) AS dateprel FROM read_parquet('{plv}') GROUP BY 1),
        pr AS (SELECT DISTINCT referenceprel, cdreseau FROM read_parquet('{plv}') WHERE cdreseau IS NOT NULL AND cdreseau <> ''),
        d AS (
            SELECT pr.cdreseau, f.famille, CAST(substr(p.dateprel, 1, 10) AS DATE) AS jour,
                   bool_or({depasse('r.val', 'r.lim_max', 'r.lim_min')}) AS dep
            FROM r JOIN f USING (cdparametre) JOIN p USING (referenceprel) JOIN pr USING (referenceprel)
            WHERE (r.lim_max IS NOT NULL OR r.lim_min IS NOT NULL)
              AND r.cdparametre NOT IN {CANALISATIONS + MATERIAUX}
            GROUP BY 1, 2, 3)
        SELECT cdreseau, famille,
               count(*) FILTER (WHERE dep) AS jours_dep,
               sum(CASE WHEN dep THEN greatest(1, date_diff('day', jour, coalesce(suivant, make_date({year}, 12, 31)))) END) AS duree
        FROM (SELECT *, lead(jour) OVER (PARTITION BY cdreseau, famille ORDER BY jour) AS suivant FROM d)
        GROUP BY 1, 2""").fetchall()

    # Restrictions citant une cause, par réseau (conclusions de l'ARS classées par avis_site.charger), et eau déconseillée
    # aux publics sensibles pour une cause (classe C).
    restr: dict[str, set[str]] = {}
    sensibles: dict[str, set[str]] = {}
    for cdreseau, cat, causes in con.execute(f"""
            SELECT DISTINCT a.cdreseau, t.cat, t.causes FROM avis_plv a JOIN avis_textes t USING (id)
            WHERE a.annee = {year} AND NOT t.local AND t.cat IN ('interdiction', 'ebullition', 'sensibles')""").fetchall():
        for fam, liste in CAUSES_FAMILLE.items():
            if not any(c in (causes or "").split(",") for c in liste):
                continue
            if cat == "sensibles":
                sensibles.setdefault(cdreseau, set()).add(fam)
            elif fam == "microbio" or cat == "interdiction":
                restr.setdefault(cdreseau, set()).add(fam)

    out: dict[str, dict[str, int]] = {}
    durees: dict[tuple[str, str], int] = {}
    nb_jours: dict[tuple[str, str], int] = {}
    for cdreseau, fam, jours_dep, duree in jours:
        durees[(cdreseau, fam)] = int(duree or 0)
        nb_jours[(cdreseau, fam)] = int(jours_dep or 0)
        if fam == "azote":  # classe nitrates : concentration maximale, plus bas
            continue
        r = fam in restr.get(cdreseau, set())
        if fam == "pesticides":
            code = 0 if not jours_dep else (3 if r else 1 if (duree or 0) <= SEUIL_JOURS else 2)
        else:  # PFAS, métaux et minéraux, autres limites : conformité simple
            code = 0 if not jours_dep else (2 if r else 1)
        out.setdefault(cdreseau, {})[fam] = code
    # Restriction de l'ARS portant sur un paramètre écarté du jugement : elle garde la famille en restriction, classe D,
    # quand ce paramètre a dépassé sa limite dans l'année (infofacture de Nogier, 007001283, 2023 : chlorure de vinyle,
    # usage alimentaire interdit, classe D ; choix de l'auteur, 2026-10-05). Le dépassement est exigé : sans lui, une
    # cause mal attribuée (« dissolution des canalisations (plomb, cuivre) » dans une restriction bactériologique, eau
    # trouble au robinet) mettait 100 à 150 réseaux par an en restriction.
    exclus = {"metaux_mineraux": CANALISATIONS, "autres": MATERIAUX}
    for fam, codes in exclus.items():
        for (cdreseau,) in con.execute(f"""
                WITH r AS (SELECT referenceprel, valtraduite AS val,
                                  {_bound(limite_qualite('limitequal', str(year)), '<=')} AS lim_max,
                                  {_bound(limite_qualite('limitequal', str(year)), '>=')} AS lim_min
                           FROM read_parquet('{result}') WHERE cdparametre IN {codes})
                SELECT DISTINCT pr.cdreseau FROM r JOIN read_parquet('{plv}') pr USING (referenceprel)
                WHERE pr.cdreseau <> '' AND {depasse('r.val', 'r.lim_max', 'r.lim_min')}""").fetchall():
            if fam in restr.get(cdreseau, set()) and cdreseau in out:
                out[cdreseau][fam] = 2

    # Nitrates : classe de la concentration maximale de l'année (bilan national nitrates).
    for cdreseau, vmax in con.execute(f"""
            SELECT cdreseau, max(vmax) FROM read_parquet('{(AGG / str(year) / 'reseau_param.parquet').as_posix()}')
            WHERE cdparametre = '{NITRATES}' AND vmax IS NOT NULL GROUP BY 1""").fetchall():
        v = float(vmax)
        out.setdefault(cdreseau, {})["azote"] = sum(v > s for s in CLASSES_NITRATES)

    # Bactériologie : durée cumulée des prélèvements non conformes aux limites (« N »), comme les autres familles.
    for cdreseau, duree in con.execute(f"""
            WITH b AS (
                SELECT cdreseau, CAST(substr(dateprel, 1, 10) AS DATE) AS jour, bool_or(plvconformitebacterio = 'N') AS nc
                FROM read_parquet('{plv}') WHERE plvconformitebacterio IN ('C', 'N') AND cdreseau <> '' GROUP BY 1, 2)
            SELECT cdreseau, sum(CASE WHEN nc THEN greatest(1, date_diff('day', jour, coalesce(suivant, make_date({year}, 12, 31)))) END)
            FROM (SELECT *, lead(jour) OVER (PARTITION BY cdreseau ORDER BY jour) AS suivant FROM b) GROUP BY 1""").fetchall():
        durees[(cdreseau, "microbio")] = int(duree or 0)

    # Bactériologie : conformité des prélèvements (DIS_PLV.plvconformitebacterio), seuil de 95 %.
    for cdreseau, nc, ne in con.execute(f"""
            SELECT cdreseau, sum(nc_bact), sum(ne_bact) FROM read_parquet('{(AGG / str(year) / 'reseau_plv.parquet').as_posix()}')
            GROUP BY 1 HAVING sum(ne_bact) > 0""").fetchall():
        nc, ne = int(nc or 0), int(ne or 0)
        code = 0 if nc == 0 else (1 if (ne - nc) / ne >= SEUIL_BACT else 2)
        if "microbio" in restr.get(cdreseau, set()):
            code = 3
        out.setdefault(cdreseau, {})["microbio"] = code

    if bact_par_an is None:
        bact_par_an = {a: bact_annee(con, a) for a in range(year - ANNEES_REPORT + 1, year + 1)}
    # Nitrates : une restriction de l'ARS citant les nitrates vaut classe D (le code nitrates n'en a pas).
    classes: dict[str, str] = {}
    bact: dict[str, list] = {}
    for cdreseau, fams in out.items():
        lettres = []
        for f in FAMILLES:
            if f not in fams:
                lettres.append("-")
            elif f == "azote" and "azote" in restr.get(cdreseau, set()):
                lettres.append("D")
            elif f == "microbio" and (cb := cumul_bact(bact_par_an, cdreseau, year)):
                lettres.append(lettre_bact(*cb[:3]))
                if lettres[-1] != "A":
                    bact[cdreseau] = [cb[0], cb[1], arrondi(cb[2], 1), cb[3]]
            elif (f == "pfas" and fams[f] == 1 and nb_jours.get((cdreseau, f), 0) < JOURS_CONFIRMATION_PFAS
                  and f not in sensibles.get(cdreseau, set())):
                lettres.append("A")
            else:
                lettres.append(lettre(f, fams[f], durees.get((cdreseau, f), 0), f in sensibles.get(cdreseau, set())))
        classes[cdreseau] = "".join(lettres)
    return out, classes, bact


def reporter(lettres: dict[str, str], historique: dict[str, dict[int, tuple[int, str]]], annee: int,
             partiel: bool = False) -> dict[str, str]:
    """Lettres d'une année, une famille non analysée prenant, en minuscule, la lettre de sa dernière année analysée
    (ANNEES_REPORT ans au plus) ; met à jour `historique` {réseau: {famille: (année, lettre)}} avec les lettres de
    l'année. Rien n'est reporté sur l'année en cours (`partiel`) : l'insuffisance des résultats ne se constate qu'à
    la fin de l'année, et une restriction de l'an passé deviendrait une classe D sans restriction cette année.
    Seuls les réseaux qui ne sont pas en A (reportées comprises) sont rendus."""
    out = {}
    for cdreseau, l in lettres.items():
        passe = historique.setdefault(cdreseau, {})
        lu = list(l)
        for i, x in enumerate(lu):
            if x == "-" and not partiel and i in passe and annee - passe[i][0] <= ANNEES_REPORT:
                lu[i] = passe[i][1].lower()
            elif x != "-":
                passe[i] = (annee, x)
        if any(x not in "Aa-" for x in lu):
            out[cdreseau] = "".join(lu)
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
    historique: dict[str, dict[int, tuple[int, str]]] = {}
    serie: dict[str, dict] = {}
    serie_depts: dict[str, dict] = {}
    bact_par_an: dict[int, dict[str, tuple[int, int, float]]] = {}
    for y in sorted(years):
        if not (C.OUT / "dis" / str(y) / "result.parquet").exists():
            continue
        utiles = {a: bact_par_an[a] if a in bact_par_an else bact_par_an.setdefault(a, bact_annee(con, a))
                  for a in range(y - ANNEES_REPORT + 1, y + 1)}
        par_reseau, lettres, bact = situations_annee(con, y, utiles)
        # Année en cours, publiée au fil de l'eau (comme `partiel` de meta.json, build.py).
        classes = reporter(lettres, historique, y, partiel=y >= int(time.strftime("%Y")))
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
        _dump(C.WEB_DATA / "situations" / f"{y}.json",
              {"familles": FAMILLES, "reseaux": codes[y], "classes": classes, "bact": bact, "depts": depts, "national": national})
        serie[str(y)] = national
        serie_depts[str(y)] = depts
        globales = [max(c.replace("-", "").upper()) for c in classes.values()]
        reportees = sum(any(x.islower() for x in c) for c in classes.values())
        print(f"  situations {y} : {len(par_reseau)} réseaux ; " + " ; ".join(f"{f} {national[f]}" for f in [*FAMILLES, "toutes"])
              + f" ; classes B {globales.count('B')}, C {globales.count('C')}, D {globales.count('D')} ({reportees} avec une lettre reportée)")
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

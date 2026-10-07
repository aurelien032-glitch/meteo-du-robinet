"""Familles de paramètres et thèmes éditoriaux.

Le référentiel Sandre ne fournit pas de « groupe » exploitable : la famille d'un paramètre est donc
déduite de sa limite réglementaire, de son unité et de son libellé. Vérifié sur le millésime 2025 :
- les 747 pesticides et métabolites pertinents portent la limite « <=0,1 µg/L » (virgule), les six
  organochlorés historiques « <=0,03 µg/L », et les sommes 6276 / 6282 / 6283 « <=0,5 µg/L » ;
- acrylamide, épichlorohydrine et HAP portent « <=0.1 µg/L » (point) : ce ne sont pas des pesticides ; la somme
  des HAP (2033, 4 substances) porte « <=0,1 µg/L » (virgule) : elle est rangée par son code (ORGANIQUES), avant
  les pesticides (relevé le 2026-10-04, 17 543 analyses de HAP comptées comme pesticides en 2025) ;
- la somme des 20 PFAS (8847) porte aussi « <=0,1 µg/L » : les PFAS sont testés avant les pesticides.

Deux seuils coexistent dans SISE-Eaux et sont toujours distingués :
- limite de qualité (limitequal) : seuil sanitaire réglementaire, son dépassement rend l'eau non conforme ;
- référence de qualité (refqual) : valeur indicative de bon fonctionnement, sans portée sanitaire directe.
"""
from __future__ import annotations

PFAS_RE = "(?i)perfluor|polyfluor|PFAS"

# Métabolites de pesticides déclarés NON PERTINENTS par l'Anses : ils perdent la limite de 0,1 µg/L pour une valeur
# indicative de 0,9 µg/L (arrêté du 11 janvier 2007, annexe I, III). SISE retire la limite au fil des saisies, de
# sorte qu'une partie des résultats de l'année de l'avis la porte encore ; l'ARS, elle, exclut le métabolite de
# l'indicateur de toute l'année de l'avis (infofacture 2024 de Dijon : « chlorothalonil R471811 non pertinent depuis
# 29/04/2024 […] n'est pas pris en compte dans l'indicateur global de qualité »). Même règle ici (choix de l'auteur,
# 2026-10-03) : {code SISE : première année sans limite}. Le métabolite reste publié, sans limite de qualité.
# Statuts vérifiés le 2026-10-05 sur le tableau de l'Anses « métabolites pertinents pour les EDCH » (juillet 2025) et
# ses avis (choix de l'auteur, « Ajouter les trois ») ; SISE-Eaux range déjà ESA-métolachlore et diméthénamide ESA sous
# des codes sans limite (MTCESA, DMTHESA) et a créé AMPANP le 21/07/2025.
NON_PERTINENTS = {
    "8865": 2024,  # chlorothalonil R471811, avis de l'Anses du 29/04/2024 (1 231 réseaux déclassés à tort en 2024)
    "6854": 2022,  # ESA-métolachlore, avis du 30/09/2022 (pertinent selon les avis de 2019 et 2021)
    "6865": 2022,  # diméthénamide ESA, avis du 26/01/2022
    "1907": 2025,  # AMPA du glyphosate, avis du 05/06/2025 (pertinent par défaut auparavant)
}


# Lecture des seuils SISE-Eaux, commune aux agrégats (build.py) et aux durées de dépassement (situations.py).
NUM_RE = r"([0-9]+(?:[,.][0-9]+)?)"


def borne(col: str, op: str) -> str:
    """Borne numérique d'un seuil SISE-Eaux (expression SQL) : « <=0,1 µg/L » → 0.1 ; « >=6,5 et <=9 unité pH » → 6.5 / 9."""
    return f"TRY_CAST(replace(regexp_extract({col}, '{op}\\s*{NUM_RE}', 1), ',', '.') AS DOUBLE)"


def depasse(val: str, bmax: str, bmin: str) -> str:
    """Valeur hors de ses bornes (expression SQL) ; faux sans borne."""
    return f"coalesce(({bmax} IS NOT NULL AND {val} > {bmax}) OR ({bmin} IS NOT NULL AND {val} < {bmin}), false)"


def limite_qualite(col: str, annee: str, parametre: str = "cdparametre") -> str:
    """Limite de qualité effective (expression SQL) : `col`, sauf pour un métabolite non pertinent à partir de l'année
    de l'avis de l'Anses (NON_PERTINENTS). `annee` : expression SQL ou littéral de l'année du résultat."""
    cas = " OR ".join(f"({parametre} = '{c}' AND {annee} >= {a})" for c, a in NON_PERTINENTS.items())
    return f"(CASE WHEN {cas} THEN NULL ELSE {col} END)" if cas else col


# Total des pesticides analysés, limite de 0,5 µg/L. Les sommes 6282 (atrazine) et 6283 (terbuthylazine) ne réunissent
# qu'une substance et ses métabolites : un métabolite non pertinent d'une autre substance n'y figure jamais.
TOTAUX_PESTICIDES = ("6276",)


def resultats_juges(result: str, annee: int) -> str:
    """Résultats d'un millésime (requête SQL sur `result`, chemin Parquet) avec `val_jugee`, la valeur comparée à la
    limite. Le total des pesticides est jugé sans les métabolites non pertinents qu'il inclut, à partir de l'année de
    l'avis de l'Anses (choix de l'auteur, 2026-10-05) : en 2024, les laboratoires y comptaient encore R471811 (total égal
    à la somme des substances plus R471811, écart médian nul ; 274 réseaux ne dépassaient que par ce total), en 2025 plus.
    Les métabolites inclus se lisent prélèvement par prélèvement : parmi toutes les combinaisons des métabolites non
    pertinents quantifiés, celle dont la somme, ajoutée aux substances quantifiées, approche le mieux le total déclaré
    (à écart égal, la plus petite). Les tester ensemble faisait manquer un total qui comptait R471811 mais pas
    l'ESA-métolachlore, déjà non pertinent (réseau 001000589, 2024). Comme l'ARS Bourgogne-Franche-Comté (infofactures
    2024 de Dijon Est, 021000144, et d'Augy, 089000439 : note A) ; l'ARS Centre-Val de Loire le comptait encore
    (Aunay-sous-Crécy, 028000701 : note B). La valeur publiée (`valtraduite`) reste celle du laboratoire."""
    np_ = sorted(c for c, a in NON_PERTINENTS.items() if annee >= a)
    src = f"read_parquet('{result}')"
    if not np_:
        return f"SELECT *, valtraduite AS val_jugee FROM {src}"
    codes_np = ", ".join(f"'{c}'" for c in np_)
    totaux = ", ".join(f"'{c}'" for c in TOTAUX_PESTICIDES)
    return f"""
        WITH r AS (SELECT * FROM {src}),
        np AS (SELECT referenceprel, cdparametre, sum(valtraduite) AS v FROM r
               WHERE cdparametre IN ({codes_np}) AND valtraduite > 0 GROUP BY 1, 2),
        npk AS (SELECT referenceprel, v, row_number() OVER (PARTITION BY referenceprel ORDER BY cdparametre) - 1 AS k FROM np),
        ind AS (SELECT referenceprel, sum(valtraduite) AS somme FROM r
                WHERE limitequal IN ('<=0,1 µg/L', '<=0,03 µg/L') AND cdparametre NOT IN ({codes_np}) AND valtraduite > 0
                GROUP BY 1),
        tot AS (SELECT DISTINCT r.referenceprel, r.valtraduite AS t, coalesce(ind.somme, 0) AS somme FROM r LEFT JOIN ind USING (referenceprel)
                WHERE r.cdparametre IN ({totaux}) AND r.valtraduite IS NOT NULL AND r.referenceprel IN (SELECT referenceprel FROM np)),
        cand AS (SELECT tot.referenceprel, tot.t, tot.somme, m.range AS masque,
                        coalesce(sum(npk.v) FILTER (WHERE (m.range >> npk.k) & 1 = 1), 0) AS s
                 FROM tot CROSS JOIN range(0, {2 ** len(np_)}) m LEFT JOIN npk USING (referenceprel)
                 GROUP BY 1, 2, 3, 4),
        retire AS (SELECT referenceprel, t, arg_min(s, (abs(t - (somme + s)), s)) AS s FROM cand GROUP BY 1, 2)
        SELECT r.*,
               CASE WHEN r.cdparametre IN ({totaux}) AND retire.s IS NOT NULL THEN r.valtraduite - retire.s
                    ELSE r.valtraduite END AS val_jugee
        FROM r LEFT JOIN retire ON retire.referenceprel = r.referenceprel AND retire.t = r.valtraduite"""

# Expression SQL DuckDB donnant la famille d'une ligne de DIS_RESULT.
# Paramètres organiques rangés par leur code : chlorure de vinyle, HAP, acrylamide, épichlorohydrine…
ORGANIQUES = ('1753', '2033', '2036', '6275', '1457', '1494', '1115', '1116', '1117', '1118', '1204')

FAMILY_CASE = f"""
CASE
  WHEN regexp_matches(libminparametre, '{PFAS_RE}') THEN 'pfas'
  WHEN cdparametre IN {ORGANIQUES} THEN 'organiques'
  WHEN cdparametre IN ('6276', '6282', '6283') OR limitequal IN ('<=0,1 µg/L', '<=0,03 µg/L') THEN 'pesticides'
  WHEN cdparametre IN ('1340', '1339', '1335') THEN 'azote'
  WHEN cdunitereference IN ('226', '222') THEN 'microbio'
  WHEN cdparametre IN ('1382', '1369', '1386', '1389', '1392', '1385', '1362', '7073', '1394', '1393', '1370',
                       '1361', '1084', '1375')
       OR libminparametre ILIKE '%antimoine%' OR libminparametre ILIKE '%cadmium%' OR libminparametre ILIKE '%mercure%'
       OR libminparametre ILIKE '%bromate%' THEN 'metaux_mineraux'
  WHEN libminparametre ILIKE '%benzène%' OR libminparametre ILIKE '%chloroéthylène%'
       OR libminparametre ILIKE '%trihalom%' OR libminparametre ILIKE '%chloroforme%' THEN 'organiques'
  WHEN cdunitereference IN ('9', '201') OR libminparametre ILIKE '%activit%' THEN 'radioactivite'
  WHEN cdunitereference = 'X' THEN 'organoleptique'
  ELSE 'physico_chimie'
END"""

# Un même paramètre peut porter une limite sur certaines lignes et aucune sur d'autres (requalification en cours
# d'année, laboratoires hétérogènes). La famille est donc décidée au niveau du paramètre : la famille la plus
# spécifique observée l'emporte, dans l'ordre du CASE ci-dessus.
FAMILY_PRIORITY = """CASE famille WHEN 'pfas' THEN 1 WHEN 'pesticides' THEN 2 WHEN 'azote' THEN 3 WHEN 'microbio' THEN 4
                     WHEN 'metaux_mineraux' THEN 5 WHEN 'organiques' THEN 6 WHEN 'radioactivite' THEN 7
                     WHEN 'organoleptique' THEN 8 ELSE 9 END"""

FAMILIES = {
    "pesticides": "Pesticides et métabolites",
    "pfas": "PFAS (polluants éternels)",
    "azote": "Nitrates, nitrites, ammonium",
    "microbio": "Bactériologie",
    "metaux_mineraux": "Métaux et minéraux",
    "organiques": "Solvants, HAP, sous-produits",
    "radioactivite": "Radioactivité",
    "physico_chimie": "Physico-chimie",
    "organoleptique": "Aspect, odeur, saveur",
}

# Paramètres suivis individuellement dans les fiches (statistiques annuelles par réseau / commune).
KEY_PARAMS = {
    "1340": "Nitrates",
    "6276": "Total pesticides",
    "8847": "Somme 20 PFAS",
    "1449": "E. coli",
    "6455": "Entérocoques",
    "1382": "Plomb",
    "1753": "Chlorure de vinyle",
    "1369": "Arsenic",
    "7073": "Fluorures",
    "1345": "Dureté (TH)",
    "1302": "pH",
    # Équilibre calcocarbonique, classe de 0 (incrustante) à 4 (agressive), référence de 1 à 2 : catégorie « eau
    # agressive » des synthèses de l'ARS, dite dans la case pH de « Mon eau » (choix de l'auteur, 2026-10-06).
    "5907": "Équilibre calcocarbonique",
    "1398": "Chlore libre",
    # Aspect de l'eau, case « Eau trouble ou colorée » de la fiche « Mon eau » (choix de l'auteur, 2026-10-05).
    "1295": "Turbidité",
    "1309": "Coloration",
    "2036": "Trihalométhanes",
    "1394": "Manganèse",
    "2098": "Tritium",
}

# Thèmes éditoriaux : chaque thème produit un fichier data/themes/<slug>.json et une page du site.
# « question » : introduction de la page du thème, de sa carte sur /themes et de sa description (plan du site, pages
# statiques). Une phrase déclarative qui dit ce que la page montre, jamais une question (règle de rédaction du 27/09).
THEMES = [
    {"slug": "pesticides", "titre": "Pesticides et métabolites", "famille": "pesticides", "param_cle": "6276",
     "question": "Réseaux où les pesticides et leurs métabolites dépassent la limite de qualité, par département et par commune."},
    {"slug": "nitrates", "titre": "Nitrates", "famille": "azote", "param_cle": "1340",
     "question": "Réseaux dont la concentration maximale en nitrates de l'année dépasse la limite de qualité de 50 mg/L, "
                 "par département et par commune."},
    {"slug": "pfas", "titre": "PFAS, les polluants éternels", "famille": "pfas", "param_cle": "8847",
     # Limite applicable depuis le 1er janvier 2023 (note DGS/EA4/2023/61 ; choix de l'auteur, 2026-10-04).
     "question": "Réseaux où la somme de 20 PFAS dépasse 0,1 µg/L, limite de qualité applicable depuis 2023, "
                 "par département et par commune."},
    {"slug": "bacteries", "titre": "Bactéries", "famille": "microbio", "param_cle": "1449",
     "question": "Réseaux dont plus de 5 % des prélèvements sont non conformes en bactériologie (E. coli, entérocoques), "
                 "ou soumis à une consigne de l'ARS, par département et par commune."},
    {"slug": "metaux", "titre": "Plomb, arsenic et autres métaux", "famille": "metaux_mineraux", "param_cle": "1382",
     "question": "Réseaux où un métal ou un minéral (plomb, arsenic, fluorures…) dépasse la limite de qualité, par département "
                 "et par commune. Le plomb provient principalement des canalisations anciennes ; l'arsenic et les fluorures "
                 "sont d'origine géologique."},
    {"slug": "radioactivite", "titre": "Radioactivité", "famille": "radioactivite", "param_cle": "2098",
     "question": "Réseaux où au moins une analyse de radioactivité dépasse une référence de qualité, par département et par "
                 "commune. Une référence de qualité est une valeur indicative, sans caractère obligatoire."},
]

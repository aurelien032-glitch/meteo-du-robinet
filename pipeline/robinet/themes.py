"""Familles de paramètres et thèmes éditoriaux.

Le référentiel Sandre ne fournit pas de « groupe » exploitable : la famille d'un paramètre est donc
déduite de sa limite réglementaire, de son unité et de son libellé. Vérifié sur le millésime 2025 :
- les 747 pesticides et métabolites pertinents portent la limite « <=0,1 µg/L » (virgule), les six
  organochlorés historiques « <=0,03 µg/L », et les sommes 6276 / 6282 / 6283 « <=0,5 µg/L » ;
- acrylamide, épichlorohydrine et HAP portent « <=0.1 µg/L » (point) : ce ne sont pas des pesticides ;
- la somme des 20 PFAS (8847) porte aussi « <=0,1 µg/L » : les PFAS sont testés avant les pesticides.

Deux seuils coexistent dans SISE-Eaux et sont toujours distingués :
- limite de qualité (limitequal) : seuil sanitaire réglementaire, son dépassement rend l'eau non conforme ;
- référence de qualité (refqual) : valeur indicative de bon fonctionnement, sans portée sanitaire directe.
"""
from __future__ import annotations

PFAS_RE = "(?i)perfluor|polyfluor|PFAS"

# Expression SQL DuckDB donnant la famille d'une ligne de DIS_RESULT.
FAMILY_CASE = f"""
CASE
  WHEN regexp_matches(libminparametre, '{PFAS_RE}') THEN 'pfas'
  WHEN cdparametre IN ('6276', '6282', '6283') OR limitequal IN ('<=0,1 µg/L', '<=0,03 µg/L') THEN 'pesticides'
  WHEN cdparametre IN ('1340', '1339', '1335') THEN 'azote'
  WHEN cdunitereference IN ('226', '222') THEN 'microbio'
  WHEN cdparametre IN ('1382', '1369', '1386', '1389', '1392', '1385', '1362', '7073', '1394', '1393', '1370',
                       '1361', '1084', '1375')
       OR libminparametre ILIKE '%antimoine%' OR libminparametre ILIKE '%cadmium%' OR libminparametre ILIKE '%mercure%'
       OR libminparametre ILIKE '%bromate%' THEN 'metaux_mineraux'
  WHEN cdparametre IN ('1753', '2036', '6275', '1457', '1494', '1115', '1116', '1117', '1118', '1204')
       OR libminparametre ILIKE '%benzène%' OR libminparametre ILIKE '%chloroéthylène%'
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
    "1398": "Chlore libre",
    "2036": "Trihalométhanes",
    "1394": "Manganèse",
    "2098": "Tritium",
}

# Thèmes éditoriaux : chaque thème produit un fichier data/themes/<slug>.json et une page du site.
THEMES = [
    {"slug": "pesticides", "titre": "Pesticides et métabolites", "famille": "pesticides", "param_cle": "6276",
     "question": "Où les pesticides et leurs métabolites dépassent-ils la limite de qualité au robinet ?"},
    {"slug": "nitrates", "titre": "Nitrates", "famille": "azote", "param_cle": "1340",
     "question": "Quels territoires distribuent une eau au-dessus de 50 mg/L de nitrates ?"},
    {"slug": "pfas", "titre": "PFAS, les polluants éternels", "famille": "pfas", "param_cle": "8847",
     "question": "Que révèlent les premières campagnes PFAS, avant la limite de 0,1 µg/L de 2026 ?"},
    {"slug": "bacteries", "titre": "Bactéries", "famille": "microbio", "param_cle": "1449",
     "question": "Où l'eau du robinet est-elle contaminée par E. coli ou les entérocoques ?"},
    {"slug": "metaux", "titre": "Plomb, arsenic et autres métaux", "famille": "metaux_mineraux", "param_cle": "1382",
     "question": "Vieilles canalisations et sous-sol : où retrouve-t-on plomb, arsenic, fluorures ?"},
    {"slug": "radioactivite", "titre": "Radioactivité", "famille": "radioactivite", "param_cle": "2098",
     "question": "Quelles eaux dépassent les références de radioactivité naturelle ?"},
]

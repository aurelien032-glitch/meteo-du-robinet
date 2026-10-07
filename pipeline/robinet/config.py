"""Chemins, sources et constantes du pipeline. Aucune logique ici."""
from __future__ import annotations

from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # racine du dépôt
DATA = ROOT / "data"
RAW = DATA / "raw"          # archives brutes (ignorées par git)
OUT = DATA / "out"          # Parquet intermédiaires (ignorés par git)
CACHE = DATA / "cache"      # réponses d'API mises en cache (ignorées par git)
WEB_DATA = ROOT / "web" / "public" / "data"  # fichiers statiques lus par le site

# Contrôle sanitaire : les quatre dernières années civiles à télécharger, et les quatre derniers millésimes réellement
# publiés à construire. En janvier, l'archive de l'année nouvelle manque encore : la fenêtre reste sur les quatre
# derniers millésimes présents, au lieu de perdre le plus ancien sans gagner le nouveau (la liste était écrite en dur).
ANNEES_CIVILES = list(range(date.today().year - 3, date.today().year + 1))


def millesimes_publies() -> list[int]:
    """Les quatre derniers millésimes dont l'archive du contrôle sanitaire est présente (data/raw/dis), à défaut les
    quatre dernières années civiles."""
    presents = sorted(int(p.stem[4:]) for p in (RAW / "dis").glob("dis-*.zip") if p.stem[4:].isdigit())
    return presents[-4:] or ANNEES_CIVILES


DEFAULT_YEARS = millesimes_publies()
# SISPEA : toutes les extractions annuelles, de 2020 (avant, la série vient de l'API Hub'Eau) à l'année en cours.
# `robinet sispea` réécrit ses fichiers avec les seules années reçues : une liste plus courte effacerait les autres.
SISPEA_YEARS = list(range(2020, date.today().year + 1))

USER_AGENT = "robinet-dataviz/0.1 (pipeline open data eau potable)"

# --- Sources -----------------------------------------------------------------
DATAGOUV_API = "https://www.data.gouv.fr/api/1"
# Résultats du contrôle sanitaire de l'eau distribuée commune par commune (SISE-Eaux, ministère de la Santé)
DIS_DATASET_ID = "5cf8d9ed8b4c4110294c841d"
# SISPEA eau potable : extractions annuelles (OFB), fichiers 7z
SISPEA_DATASET_ID = "6a582159f9121211f67fa59c"
HUBEAU = "https://hubeau.eaufrance.fr/api"
# Historique SISPEA 2008-2019 : l'API Hub'Eau des indicateurs des services (v0/indicateurs_services) répond HTTP 410
# depuis septembre 2026 (constaté le 28/09, sans v1). Instantané figé et versionné, tiré du cache complet (12
# indicateurs × 12 années) : il ne changera plus, et la machine du rafraîchissement automatique n'a pas ce cache.
SISPEA_HISTORIQUE_FIGE = ROOT / "pipeline" / "donnees-figees" / "sispea_historique_2008_2019.parquet"
# Contours administratifs simplifiés (Etalab / IGN Admin Express)
ETALAB_CONTOURS = "https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/{year}/geojson/{name}"

# Départements (métropole + Corse + DROM) pour découper les requêtes Hub'Eau plafonnées à 20 000 lignes
DEPARTEMENTS = [f"{i:02d}" for i in range(1, 96) if i != 20] + ["2A", "2B", "971", "972", "973", "974", "976"]

# Plafond Hub'Eau : page * size <= 20 000 sur les APIs v0/v1
HUBEAU_CAP = 20000

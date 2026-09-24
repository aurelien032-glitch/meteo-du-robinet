"""Chemins, sources et constantes du pipeline. Aucune logique ici."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # racine du dépôt
DATA = ROOT / "data"
RAW = DATA / "raw"          # archives brutes (ignorées par git)
OUT = DATA / "out"          # Parquet intermédiaires (ignorés par git)
CACHE = DATA / "cache"      # réponses d'API mises en cache (ignorées par git)
WEB_DATA = ROOT / "web" / "public" / "data"  # fichiers statiques lus par le site

DEFAULT_YEARS = [2023, 2024, 2025, 2026]

USER_AGENT = "robinet-dataviz/0.1 (pipeline open data eau potable)"

# --- Sources -----------------------------------------------------------------
DATAGOUV_API = "https://www.data.gouv.fr/api/1"
# Résultats du contrôle sanitaire de l'eau distribuée commune par commune (SISE-Eaux, ministère de la Santé)
DIS_DATASET_ID = "5cf8d9ed8b4c4110294c841d"
# SISPEA eau potable : extractions annuelles (OFB), fichiers 7z
SISPEA_DATASET_ID = "6a582159f9121211f67fa59c"
HUBEAU = "https://hubeau.eaufrance.fr/api"
SANDRE = "https://api.sandre.eaufrance.fr/referentiels/v1"
VIGIEAU = "https://api.vigieau.gouv.fr/api"
# Contours administratifs simplifiés (Etalab / IGN Admin Express)
ETALAB_CONTOURS = "https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/{year}/geojson/{name}"

# Départements (métropole + Corse + DROM) pour découper les requêtes Hub'Eau plafonnées à 20 000 lignes
DEPARTEMENTS = [f"{i:02d}" for i in range(1, 96) if i != 20] + ["2A", "2B", "971", "972", "973", "974", "976"]

# Plafond Hub'Eau : page * size <= 20 000 sur les APIs v0/v1
HUBEAU_CAP = 20000

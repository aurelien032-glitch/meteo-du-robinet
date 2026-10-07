"""Utilitaires communs du pipeline (revue du 04/10) : écriture des JSON du site, arrondi, codes de département.

Ils étaient recopiés dans sept modules, avec des options qui avaient divergé (NaN accepté ici, refusé là).
"""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from . import config as C


def dump(path: Path, obj, *, entrees: int | None = None, silencieux: bool = False) -> None:
    """Écrit un JSON compact. Clés triées : l'ordre d'un dictionnaire construit depuis une requête SQL sans ORDER BY
    changeait d'une construction à l'autre, et avec lui l'octet près des fichiers publiés (le site trie ce qu'il
    affiche). NaN refusé : JSON.parse le rejetterait côté site."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False, sort_keys=True, default=_nombre),
                    encoding="utf-8")
    if not silencieux:
        suite = f", {entrees} entrées" if entrees is not None else ""
        print(f"  → {path.relative_to(C.ROOT).as_posix()} ({path.stat().st_size / 1e3:.0f} ko{suite})")


def _nombre(x):
    """Somme exacte de DuckDB (DECIMAL) restée telle quelle : écrite en nombre."""
    if isinstance(x, Decimal):
        return float(x)
    raise TypeError(f"{type(x).__name__} non sérialisable en JSON")


def arrondi(x, d: int = 3):
    """Arrondi JSON-compatible (NaN → null ; un DECIMAL de DuckDB devient un nombre)."""
    if isinstance(x, Decimal):
        x = float(x)
    if isinstance(x, float):
        return None if x != x else round(x, d)
    return x


def dept_of_insee(insee: str) -> str:
    """Département d'une commune : deux caractères, trois outre-mer ; Saint-Barthélemy et Saint-Martin (977, 978)
    avec la Guadeloupe (971), dont ils dépendaient pour le contrôle sanitaire."""
    if insee.startswith(("977", "978")):
        return "971"
    if insee.startswith(("97", "98")):
        return insee[:3]
    return insee[:2]


def dept_site(code: str) -> str:
    """Département au format des contours et du site (« 01 », « 2A », « 971 ») depuis le code SISE (« 001 », « 02A »)."""
    if code.startswith("97"):
        return code[:3]
    return code[1:] if len(code) == 3 and code.startswith("0") else code


def sql_modes(source: str, cle: str, colonnes: dict[str, str]) -> str:
    """Requête SQL : par `cle`, la valeur la plus fréquente de chaque expression de `colonnes` ({alias: expression}), les
    ex æquo départagés par la plus petite valeur (le mode() de DuckDB les départage au hasard ; « % » avant
    « n(colonies)/mL » pour les % de colonies d'algues, à égalité en 2023) ; NULL ignorés, clé
    absente si aucune valeur. Colonnes `cle` puis les alias, en texte."""
    unions = " UNION ALL ".join(f"SELECT {cle} AS k, '{a}' AS c, CAST({e} AS VARCHAR) AS v FROM {source}"
                                for a, e in colonnes.items())
    choix = ", ".join(f"arg_min(v, (-n, v)) FILTER (WHERE c = '{a}') AS {a}" for a in colonnes)
    return (f"SELECT k AS {cle.split('.')[-1]}, {choix} FROM (SELECT k, c, v, count(*) AS n FROM ({unions}) u "
            f"WHERE v IS NOT NULL GROUP BY 1, 2, 3) m GROUP BY 1")

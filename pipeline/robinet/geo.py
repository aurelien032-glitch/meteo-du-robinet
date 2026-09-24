"""Contours administratifs Etalab → GeoJSON du site (web/public/data/geo/).

- departements.json            : les 101 départements, contours simplifiés à 100 m
- communes/<dd>.json           : communes d'un département (chargées à la demande sur la carte)
- communes-1000m.json          : toutes les communes en simplification grossière (vue nationale, mode studio)
- data/out/commune_names.json  : code INSEE → nom propre (accents, casse), réutilisé par l'index de recherche
"""
from __future__ import annotations

import json
from pathlib import Path

from . import config as C
from .build import _dept_of_insee


def _round_coords(coords, nd: int = 4):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [_round_coords(c, nd) for c in coords]


def _feature(f: dict, keep: tuple[str, ...]) -> dict:
    p = f["properties"]
    return {"type": "Feature", "properties": {k: p.get(k) for k in keep},
            "geometry": {"type": f["geometry"]["type"], "coordinates": _round_coords(f["geometry"]["coordinates"])}}


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _dept_of(p: dict) -> str:
    # Le département brut d'Etalab place Saint-Martin/Saint-Barthélemy en 978/977, des codes que le reste
    # du pipeline n'utilise pas (build._dept_of_insee les replie sur 971, faute de fiche ou de seuils SISPEA
    # propres) ; sans le même repli ici, leurs deux communes n'avaient ni contour de carte ni fichier
    # communes/977.json ou 978.json, alors que leurs statistiques sanitaires existaient bien sous 971.
    return _dept_of_insee(p["code"])


def run() -> dict[str, str]:
    raw, out = C.RAW / "geo", C.WEB_DATA / "geo"
    keep = set(C.DEPARTEMENTS)

    deps = json.loads((raw / "departements-100m.geojson").read_text(encoding="utf-8"))
    feats = [_feature(f, ("code", "nom")) for f in deps["features"] if f["properties"].get("code") in keep]
    _dump(out / "departements.json", {"type": "FeatureCollection", "features": feats})
    print(f"  → geo/departements.json : {len(feats)} départements")

    communes = json.loads((raw / "communes-100m.geojson").read_text(encoding="utf-8"))
    by_dept: dict[str, list] = {}
    names: dict[str, str] = {}
    for f in communes["features"]:
        p = f["properties"]
        by_dept.setdefault(_dept_of(p), []).append(_feature(f, ("code", "nom")))
        names[p["code"]] = p["nom"]
    total = 0
    for d, fs in by_dept.items():
        if d not in keep:
            continue
        _dump(out / "communes" / f"{d}.json", {"type": "FeatureCollection", "features": fs})
        total += len(fs)
    print(f"  → geo/communes/<dd>.json : {total} communes dans {len(by_dept)} départements")

    light = raw / "communes-1000m.geojson"
    if light.exists():
        g = json.loads(light.read_text(encoding="utf-8"))
        feats = [_feature(f, ("code",)) for f in g["features"] if _dept_of(f["properties"]) in keep]
        _dump(out / "communes-1000m.json", {"type": "FeatureCollection", "features": feats})
        print(f"  → geo/communes-1000m.json : {len(feats)} communes ({(out / 'communes-1000m.json').stat().st_size / 1e6:.1f} Mo)")

    C.OUT.mkdir(parents=True, exist_ok=True)
    (C.OUT / "commune_names.json").write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")
    return names

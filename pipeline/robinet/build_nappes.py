"""Niveau des nappes (piézométrie Hub'Eau) → site : chaque mois situé par rapport aux mêmes mois passés.

Pour un piézomètre et un mois donné, le niveau moyen du mois est comparé aux niveaux moyens du même mois des
années précédentes (au moins 15 années). Sa position (rang centile) le range dans une des sept classes utilisées
par le BRGM pour son indicateur piézométrique standardisé (IPS) : très bas (10 % des années les plus basses),
bas, modérément bas, autour de la normale, modérément haut, haut, très haut. Le calcul ici est un rang empirique,
pas l'IPS officiel (qui ajuste une loi de probabilité) : les classes sont comparables, les chiffres ne sont pas
ceux du bulletin du BRGM.

Fichiers : nappes/national.json (classes par mois, national et par département) et nappes/<dd>.json (séries des
piézomètres du département, normale mensuelle, piézomètre le plus proche de chaque commune).
"""
from __future__ import annotations

import json
import math
import time

from . import config as C
from .build import _dept_of_insee, _dump, _n

CLASSES = ["très bas", "bas", "modérément bas", "autour de la normale", "modérément haut", "haut", "très haut"]
SEUILS = [0.10, 0.20, 0.40, 0.60, 0.80, 0.90]
ANNEES_MIN = 15


def classe(valeur: float, historique: list[float]) -> int | None:
    """Classe 0..6 d'une valeur parmi les valeurs historiques du même mois (rang centile, ex-æquo comptés à moitié)."""
    if len(historique) < ANNEES_MIN:
        return None
    sous = sum(1 for h in historique if h < valeur) + 0.5 * sum(1 for h in historique if h == valeur)
    p = sous / len(historique)
    return sum(1 for s in SEUILS if p >= s)


def _moyennes(brut: dict) -> dict[str, float]:
    return {m: s / n for m, (s, n) in brut.get("mois", {}).items() if n}


def _centroides() -> dict[str, tuple[float, float]]:
    """Centre approché (milieu de l'emprise) de chaque commune, depuis les contours Etalab bruts."""
    g = json.loads((C.RAW / "geo" / "communes-100m.geojson").read_text(encoding="utf-8"))
    out = {}
    for f in g["features"]:
        xs, ys = [], []

        def parcourir(c):
            if isinstance(c[0], (int, float)):
                xs.append(c[0])
                ys.append(c[1])
            else:
                for x in c:
                    parcourir(x)
        parcourir(f["geometry"]["coordinates"])
        out[f["properties"]["code"]] = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    return out


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((a[0] - b[0]) * 111.32 * math.cos(lat), (a[1] - b[1]) * 110.57)


def run() -> None:
    from .apis import piezo_stations

    stations = {s["code_bss"]: s for s in piezo_stations()}
    cache = C.CACHE / "piezo" / "mensuel"
    series: dict[str, dict[str, float]] = {}
    # Le « / » du code BSS est remplacé par « _ » dans le nom du fichier en cache (apis.piezo_mensuel).
    par_fichier = {c.replace("/", "_"): c for c in stations}
    for p in cache.glob("*.json"):
        code = par_fichier.get(p.stem)
        if code is None:  # piézomètre plus actif cette année
            continue
        m = _moyennes(json.loads(p.read_text(encoding="utf-8")))
        if m:
            series[code] = m
    if not series:
        raise RuntimeError("aucune série piézométrique en cache : lancer `robinet api --what piezo`")

    # Mois de référence : le dernier mois complet (le mois en cours n'a pas toutes ses mesures).
    auj = time.localtime()
    ref_y, ref_m = (auj.tm_year, auj.tm_mon - 1) if auj.tm_mon > 1 else (auj.tm_year - 1, 12)
    mois_ref = f"{ref_y}-{ref_m:02d}"
    # Fenêtre de classes : les 60 derniers mois jusqu'au mois de référence.
    fenetre = []
    y, m = ref_y, ref_m
    for _ in range(60):
        fenetre.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    fenetre.reverse()

    classes: dict[str, dict[str, int]] = {}
    for code, s in series.items():
        c = {}
        for mo in fenetre:
            if mo not in s:
                continue
            hist = [v for k, v in s.items() if k[5:] == mo[5:] and k < mo]
            k = classe(s[mo], hist)
            if k is not None:
                c[mo] = k
        if c:
            classes[code] = c

    national: dict = {"classes": CLASSES, "mois_ref": mois_ref, "mois": fenetre, "historique": {}, "depts": {},
                      "n_piezometres": len(classes), "methode": "rang du niveau moyen du mois parmi les mêmes mois des années précédentes (≥ 15 ans), classes de l'IPS du BRGM"}
    par_dept: dict[str, list[str]] = {}
    for code in classes:
        dd = stations[code].get("code_departement")
        if dd:
            par_dept.setdefault(dd, []).append(code)
    for mo in fenetre:
        cnt = [0] * 7
        for c in classes.values():
            if mo in c:
                cnt[c[mo]] += 1
        national["historique"][mo] = cnt
    for dd, codes in par_dept.items():
        national["depts"][dd] = {}
        for mo in fenetre[-24:]:
            cnt = [0] * 7
            for code in codes:
                if mo in classes[code]:
                    cnt[classes[code][mo]] += 1
            if any(cnt):
                national["depts"][dd][mo] = cnt
    _dump(C.WEB_DATA / "nappes" / "national.json", national)

    # Fiches départementales : séries sur 10 ans, normale mensuelle (p10, p50, p90), classes, plus proche piézomètre.
    centres = _centroides()
    debut_serie = f"{ref_y - 10}-01"
    communes_par_dept: dict[str, list[str]] = {}
    for insee in centres:
        communes_par_dept.setdefault(_dept_of_insee(insee), []).append(insee)
    # Un fichier par département, même sans piézomètre : la fiche commune le charge toujours (un 404 attendu
    # serait affiché comme une panne par les autres encarts en cours de chargement).
    for dd in C.DEPARTEMENTS:
        par_dept.setdefault(dd, [])
    for dd, codes in par_dept.items():
        out: dict = {"mois_ref": mois_ref, "piezometres": {}, "communes": {}}
        for code in codes:
            s, st = series[code], stations[code]
            normale = {}
            for mm in range(1, 13):
                h = sorted(v for k, v in s.items() if int(k[5:]) == mm and k[:4] < str(ref_y))
                if len(h) >= ANNEES_MIN:
                    # Bords de la bande = valeurs où la classe bascule (même règle que classe()) : sous le bord bas,
                    # moins de 10 % des années sont plus basses (« très bas ») ; au-dessus du bord haut, au moins 90 %.
                    bord = lambda t: h[max(0, math.ceil(t * len(h)) - 1)]  # noqa: E731
                    normale[f"{mm:02d}"] = [_n(bord(0.1), 2), _n(h[len(h) // 2], 2), _n(bord(0.9), 2)]
            out["piezometres"][code] = {
                "insee": st.get("code_commune_insee"), "commune": st.get("nom_commune"),
                "nappe": (st.get("noms_masse_eau_edl") or [None])[0] if isinstance(st.get("noms_masse_eau_edl"), list) else st.get("noms_masse_eau_edl"),
                "prof": st.get("profondeur_investigation"), "xy": [_n(st.get("x"), 4), _n(st.get("y"), 4)],
                "debut": min(s)[:4],  # début des données réellement utilisées (au plus 1996), pas de la station
                "serie": [[k, _n(v, 2)] for k, v in sorted(s.items()) if k >= debut_serie],
                "normale": normale, "classes": classes[code],
            }
        pts = [(code, (stations[code].get("x"), stations[code].get("y"))) for code in codes if stations[code].get("x")]
        for insee in communes_par_dept.get(dd, []):
            if not pts:
                break
            best = min(pts, key=lambda cp: _km(centres[insee], cp[1]))
            out["communes"][insee] = [best[0], round(_km(centres[insee], best[1]), 1)]
        _dump(C.WEB_DATA / "nappes" / f"{dd}.json", out)
    print(f"  nappes : {len(classes)} piézomètres classés, mois de référence {mois_ref}, {sum(1 for c in par_dept.values() if c)} départements")


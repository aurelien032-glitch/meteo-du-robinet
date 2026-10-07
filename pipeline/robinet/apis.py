"""Clients des APIs ouvertes : Hub'Eau (SISPEA historique, BNPE, BNV-D…), Sandre, VigiEau.

Toutes les réponses sont mises en cache dans data/cache/ pour que `build` soit rejouable hors ligne.
"""
from __future__ import annotations

import json
import time
from collections.abc import Callable

from . import config as C
from .download import session


class HubeauTooMany(RuntimeError):
    """La requête dépasse le plafond Hub'Eau (20 000 lignes) : il faut la découper."""


def cached_json(key: str, producer: Callable[[], object], *, force: bool = False):
    p = C.CACHE / f"{key}.json"
    if p.exists() and not force:
        return json.loads(p.read_text(encoding="utf-8"))
    data = producer()
    p.parent.mkdir(parents=True, exist_ok=True)
    # Écriture atomique (comme download.fetch) : un process tué en cours de write() ne doit pas laisser un
    # .json tronqué que le prochain run relirait comme valide (ou ferait planter json.loads sans dire pourquoi).
    tmp = p.with_name(p.name + ".part")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)
    return data


# Rafraîchissement mensuel des sources amont (BNPE, BNV-D, ADES, Naïades ; choix de l'auteur du 04/10) : quand le plus
# ancien cache d'une source a plus de TTL_JOURS, tous ses départements sont repris au même passage. Un premier essai par
# lots de 30 départements mêlait deux millésimes (BNPE 2024 publiée pour 61 départements, 2023 pour les autres) : les
# volumes des départements sans la nouvelle année disparaissaient de la ressource. Un échec garde le cache précédent.
TTL_JOURS = 30


def a_rafraichir(prefix: str) -> set[str]:
    """Tous les départements de la source `prefix` si son plus ancien cache a dépassé TTL_JOURS, sinon aucun."""
    limite = time.time() - TTL_JOURS * 86400
    dates = [p.stat().st_mtime for d in C.DEPARTEMENTS if (p := C.CACHE / prefix / f"{d}.json").exists()]
    return set(C.DEPARTEMENTS) if dates and min(dates) < limite else set()


def cache_rafraichi(key: str, producer: Callable[[], object], *, rafraichir: bool, force: bool = False):
    """cached_json, repris si `rafraichir` ; un échec de la reprise garde le cache."""
    if rafraichir and not force:
        try:
            return cached_json(key, producer, force=True)
        except Exception as e:  # coupure, HTTP, plafond : la donnée en cache reste valable
            print(f"  ! {key} : rafraîchissement impossible ({type(e).__name__}), cache gardé")
    return cached_json(key, producer, force=force)


def hubeau_rows(path: str, params: dict, *, page_size: int = 5000) -> list[dict]:
    """Toutes les lignes d'un endpoint Hub'Eau, en suivant les liens `next`.

    Lève HubeauTooMany si le total dépasse le plafond : l'appelant découpe alors par département ou par année.
    """
    s = session()
    rows: list[dict] = []
    url: str | None = f"{C.HUBEAU}/{path}"
    q: dict | None = dict(params, size=page_size)
    first = True
    while url:
        # Reprises dans la session (download.REPRISES) ; connexion en 10 s, page de 5 000 lignes en 120 s au plus.
        r = s.get(url, params=q, timeout=(10, 120))
        if r.status_code not in (200, 206):
            raise RuntimeError(f"Hub'Eau {path} HTTP {r.status_code}: {r.text[:200]}")
        j = r.json()
        if first and (j.get("count") or 0) > C.HUBEAU_CAP:
            raise HubeauTooMany(j["count"])
        first = False
        rows.extend(j.get("data") or [])
        url, q = j.get("next"), None
    return rows


def hubeau_by_departement(path: str, params: dict, *, split_years: range | None = None,
                          cache_prefix: str, force: bool = False, dept_param: str = "code_departement",
                          year_params: Callable[[int], dict] | None = None) -> list[dict]:
    """Requête nationale découpée par département, puis par année si un département dépasse le plafond.

    `year_params(annee)` donne les paramètres de filtrage d'une année (par défaut `annee=…`) ; les APIs
    datées utilisent plutôt des bornes `date_debut_… / date_fin_…`.
    """
    rows: list[dict] = []
    yp = year_params or (lambda y: {"annee": y})
    repris = a_rafraichir(cache_prefix)
    for dep in C.DEPARTEMENTS:
        def produce(dep: str = dep) -> list[dict]:
            try:
                return hubeau_rows(path, dict(params, **{dept_param: dep}))
            except HubeauTooMany:
                if not split_years:
                    raise
                out: list[dict] = []
                for y in split_years:
                    out += hubeau_rows(path, dict(params, **{dept_param: dep}, **yp(y)))
                return out
        part = cache_rafraichi(f"{cache_prefix}/{dep}", produce, rafraichir=dep in repris, force=force)
        print(f"  {cache_prefix} {dep}: {len(part)} lignes{' (rafraîchi)' if dep in repris else ''}")
        rows += part
    return rows


def bnpe_aep(*, force: bool = False) -> list[dict]:
    return hubeau_by_departement("v1/prelevements/chroniques", {"code_usage": "AEP"},
                                 split_years=range(2008, 2027), cache_prefix="bnpe_aep", force=force)


def bnpe_ouvrages(*, force: bool = False) -> list[dict]:
    return hubeau_by_departement("v1/prelevements/referentiel/ouvrages", {}, cache_prefix="bnpe_ouvrages",
                                 force=force)


# --- BNV-D : ventes de substances phytopharmaceutiques par département ---
def bnvd_ventes_departement(years: range = range(2018, 2026), *, force: bool = False) -> list[dict]:
    """Ventes agrégées par département, année, substance et fonction.

    L'API renvoie une ligne par produit (AMM) et substance : plus de 20 000 lignes par département et par
    année pour les départements agricoles. On agrège donc chaque réponse avant de la mettre en cache.
    """
    rows: list[dict] = []
    fields = "annee,code_substance,libelle_substance,fonction,classification,code_cas,quantite"
    y0, y1 = years.start, years.stop - 1

    def fetch(dep: str, a: int, b: int) -> list[dict]:
        # `annee` seul est ignoré par cette API : il faut borner avec annee_min / annee_max.
        return hubeau_rows("v1/vente_achat_phyto/ventes/substances",
                           {"code_territoire": dep, "type_territoire": "Departement", "annee_min": a, "annee_max": b,
                            "fields": fields}, page_size=20000)

    repris = a_rafraichir("bnvd")
    for dep in C.DEPARTEMENTS:
        def produce(dep: str = dep) -> list[dict]:
            try:
                raw = fetch(dep, y0, y1)  # ≈ 1 000 lignes par an et par département : une requête suffit
            except HubeauTooMany:
                raw = []
                for y in years:
                    raw += fetch(dep, y, y)
            agg: dict[tuple, dict] = {}
            manquantes = 0
            for r in raw:
                key = (r.get("annee"), r.get("code_substance"), r.get("libelle_substance"), r.get("fonction"), r.get("classification"))
                a = agg.setdefault(key, {"annee": key[0], "code_substance": key[1], "libelle_substance": key[2], "fonction": key[3],
                                         "classification": key[4], "code_cas": r.get("code_cas"), "quantite": 0.0, "n_lignes": 0})
                if r.get("quantite") is None:
                    manquantes += 1  # champ absent (dérive de schéma) : compté 0, mais signalé au lieu de rester invisible
                a["quantite"] += r.get("quantite") or 0.0
                a["n_lignes"] += 1
            if manquantes:
                print(f"  ! BNV-D {dep}: {manquantes} lignes sans quantite (comptées 0)")
            return [dict(v, code_departement=dep) for v in agg.values()]
        part = cache_rafraichi(f"bnvd/{dep}", produce, rafraichir=dep in repris, force=force)
        rows += part
        print(f"  BNV-D {dep}: {len(part)} lignes")
    return rows


# --- ADES : qualité des nappes (nitrates, pesticides…) par département ---
def ades_param_departement(code_param: str, date_min: str = "2020-01-01", *, force: bool = False) -> list[dict]:
    """Analyses d'un paramètre dans les eaux souterraines depuis `date_min`, tous départements."""
    fields = ("code_bss,num_departement,code_insee_actuel,longitude,latitude,resultat,date_debut_prelevement,"
              "codes_reseau,code_param,symbole_unite,limite_quantification")
    return hubeau_by_departement(
        "v1/qualite_nappes/analyses", {"code_param": code_param, "date_debut_prelevement": date_min, "fields": fields},
        split_years=range(int(date_min[:4]), 2027), cache_prefix=f"ades/{code_param}", force=force,
        dept_param="num_departement",
        year_params=lambda y: {"date_debut_prelevement": f"{y}-01-01", "date_fin_prelevement": f"{y}-12-31"})


# --- Naïades : qualité des cours d'eau (nitrates, pesticides…) par département ---
def naiades_param_departement(code_param: str, date_min: str = "2020-01-01", *, force: bool = False) -> list[dict]:
    """Analyses physico-chimiques d'un paramètre dans les rivières depuis `date_min`, tous départements (API v2)."""
    fields = ("code_station,libelle_station,code_departement,date_prelevement,resultat,code_parametre,symbole_unite,"
              "longitude,latitude,code_remarque,limite_quantification")
    return hubeau_by_departement(
        "v2/qualite_rivieres/analyse_pc", {"code_parametre": code_param, "date_debut_prelevement": date_min, "fields": fields},
        split_years=range(int(date_min[:4]), 2027), cache_prefix=f"naiades/{code_param}", force=force,
        year_params=lambda y: {"date_debut_prelevement": f"{y}-01-01", "date_fin_prelevement": f"{y}-12-31"})


# --- Piézométrie (Hub'Eau niveaux_nappes) : niveau des nappes, en moyennes mensuelles ---
PIEZO_FIELDS = ("code_bss,date_debut_mesure,date_fin_mesure,nb_mesures_piezo,code_departement,code_commune_insee,"
                "nom_commune,x,y,profondeur_investigation,noms_masse_eau_edl")


def piezo_stations(*, force: bool = False) -> list[dict]:
    """Piézomètres actifs cette année (mesure depuis le 1er janvier), avec leurs dates de début et de fin."""
    annee = time.strftime("%Y")
    return cached_json(f"piezo/stations_{annee}", lambda: hubeau_rows(
        "v1/niveaux_nappes/stations", {"date_recherche": f"{annee}-01-01", "fields": PIEZO_FIELDS}), force=force)


def _piezo_mesures(code: str, debut: str | None) -> list[dict]:
    """Mesures journalières d'un piézomètre depuis `debut`, découpées par décennie si le plafond Hub'Eau est atteint."""
    q = {"code_bss": code, "fields": "date_mesure,niveau_nappe_eau"}
    if debut:
        q["date_debut_mesure"] = debut
    try:
        return hubeau_rows("v1/niveaux_nappes/chroniques", q, page_size=20000)
    except HubeauTooMany:
        rows: list[dict] = []
        an0 = int((debut or "1960")[:4])
        for a in range(an0 - an0 % 10, int(time.strftime("%Y")) + 1, 10):
            d = max(f"{a}-01-01", debut or "")
            rows += hubeau_rows("v1/niveaux_nappes/chroniques", dict(q, date_debut_mesure=d, date_fin_mesure=f"{a + 9}-12-31"),
                                page_size=20000)
        return rows


def _fin_en_cache(code: str) -> str | None:
    """Date de la dernière mesure d'un piézomètre dans le cache, None s'il n'y est pas."""
    p = C.CACHE / "piezo" / "mensuel" / (code.replace("/", "_") + ".json")
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("fin")
    except (OSError, ValueError):
        return None


# Trente ans d'historique suffisent à situer un mois par rapport aux mêmes mois passés (le BRGM en demande 15) ;
# remonter aux années 1970 multipliait le volume téléchargé pour les piézomètres anciens ou à mesures horaires.
PIEZO_DEBUT = "1996-01-01"


def piezo_mensuel(code: str, *, force: bool = False, fin_publiee: str | None = None) -> dict:
    """{"mois": {"AAAA-MM": [somme des niveaux, nombre de mesures]}, "fin": dernière date} pour un piézomètre.

    Seules les moyennes mensuelles sont gardées (le brut ferait ~18 millions de lignes pour 2 300 piézomètres).
    Mise à jour incrémentale : on retélécharge depuis le premier jour du dernier mois en cache, recalculé en entier.
    `fin_publiee` : date de la dernière mesure selon la liste des stations (piezo_stations) ; quand elle n'est pas
    postérieure à celle du cache, rien n'est retéléchargé.
    """
    p = C.CACHE / "piezo" / "mensuel" / (code.replace("/", "_") + ".json")
    prev = json.loads(p.read_text(encoding="utf-8")) if p.exists() and not force else None
    if prev and prev.get("maj") == time.strftime("%Y-%m-%d"):
        return prev
    # Aucune mesure publiée depuis la dernière mise à jour (mesuré le 29/09/2026 : 2 piézomètres sur 2 397 en un jour ;
    # la date de la liste des stations égalait celle du cache pour tous les autres). Chaque piézomètre retéléchargé
    # coûte une requête, et Hub'Eau n'en accepte qu'environ 17 par minute : l'étape durait deux heures chaque semaine.
    if prev and prev.get("fin") and fin_publiee and fin_publiee[:10] <= prev["fin"][:10]:
        return prev
    debut = PIEZO_DEBUT
    mois = {}
    if prev and prev.get("fin"):
        mois = prev["mois"]
        dernier = prev["fin"][:7]
        mois.pop(dernier, None)
        debut = f"{dernier}-01"
    fin = prev.get("fin") if prev else None
    for r in _piezo_mesures(code, debut):
        v, d = r.get("niveau_nappe_eau"), r.get("date_mesure")
        if v is None or not d:
            continue
        m = mois.setdefault(d[:7], [0.0, 0])
        m[0] += v
        m[1] += 1
        fin = max(fin or d, d)
    out = {"mois": mois, "fin": fin, "maj": time.strftime("%Y-%m-%d")}
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    tmp.write_text(json.dumps(out), encoding="utf-8")
    tmp.replace(p)
    return out


def piezo_tous(*, annees_min: int = 15, workers: int = 1, force: bool = False) -> dict[str, dict]:
    """Moyennes mensuelles de tous les piézomètres actifs ayant au moins `annees_min` ans d'historique.

    Séquentiel par défaut : en parallèle, Hub'Eau renvoie des refus de débit et les reprises ralentissent tout
    (mesuré : 10 piézomètres/min à 6 connexions, ~17/min à une seule). Le premier chargement prend ~2 h ; les
    suivants ne retéléchargent que le dernier mois des piézomètres qui ont publié une mesure depuis (cache par
    piézomètre, reprise possible).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Liste des stations relue à chaque exécution (une requête) : elle donne la date de la dernière mesure publiée
    # de chaque piézomètre, et les stations apparues en cours d'année (elle n'était lue qu'une fois par an).
    limite = f"{int(time.strftime('%Y')) - annees_min}-12-31"
    # Une coupure de Hub'Eau sur cette seule requête bloquait toute la publication (exécution du 03/10/2026) : la
    # liste en cache prend alors le relais, et les piézomètres sans date plus récente attendent la semaine suivante.
    try:
        liste = piezo_stations(force=True)
    except Exception as e:  # noqa: BLE001 — toute erreur réseau ou d'API
        print(f"  ! liste des stations non relue ({e}) : liste en cache")
        liste = piezo_stations()
    stations = [s for s in liste if (s.get("date_debut_mesure") or "9999") <= limite]
    out: dict[str, dict] = {}
    erreurs = 0
    avant = {s["code_bss"]: _fin_en_cache(s["code_bss"]) for s in stations}
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(piezo_mensuel, s["code_bss"], force=force, fin_publiee=s.get("date_fin_mesure")): s["code_bss"]
                for s in stations}
        for i, f in enumerate(as_completed(futs), 1):
            try:
                out[futs[f]] = f.result()
            except Exception as e:  # un piézomètre en échec ne bloque pas les autres, mais on le compte
                erreurs += 1
                print(f"  ! {futs[f]} : {e}")
            if i % 200 == 0:
                print(f"  {i}/{len(stations)} piézomètres", flush=True)
    nouveaux = sum(1 for c, d in out.items() if d.get("fin") != avant.get(c))
    print(f"  piézométrie : {len(out)} piézomètres, dont {nouveaux} avec une mesure nouvelle, {erreurs} en échec")
    if erreurs > len(stations) * 0.05:
        raise RuntimeError(f"piézométrie : {erreurs} piézomètres en échec sur {len(stations)}")
    return out

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
        r = None
        for attempt in range(4):
            r = s.get(url, params=q, timeout=180)
            if r.status_code in (200, 206):
                break
            time.sleep(2 * (attempt + 1))
        assert r is not None
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
        part = cached_json(f"{cache_prefix}/{dep}", produce, force=force)
        print(f"  {cache_prefix} {dep}: {len(part)} lignes")
        rows += part
    return rows


# --- SISPEA historique (l'API Hub'Eau s'arrête en 2019, les années suivantes viennent des archives 7z) ---
# Seuls ces codes existent côté API pour l'eau potable (P105.3, P109.0, P153.2, P154.0, P103.2B renvoient HTTP 400).
SISPEA_INDICATEURS = ["D101.0", "D102.0", "D151.0", "P101.1", "P102.1", "P104.3", "P106.3", "P107.2", "P108.3",
                      "P151.1", "P152.1", "P155.1"]


def sispea_history(indicateurs: list[str] = SISPEA_INDICATEURS, years: range = range(2008, 2020),
                   *, force: bool = False) -> list[dict]:
    rows: list[dict] = []
    for ind in indicateurs:
        n = 0
        for y in years:
            def produce(ind: str = ind, y: int = y) -> list[dict]:
                return hubeau_rows("v0/indicateurs_services/indicateurs", {"code_indicateur": ind, "annee": y})
            # Le [] n'est mis en cache que s'il vient réellement de l'API : sinon une panne transitoire dont le
            # corps de réponse contient par hasard « 400 » serait prise pour un indicateur inconnu et resterait
            # « vide » pour toujours (cached_json n'écrit qu'après le succès de produce, donc l'échec ci-dessous
            # n'est jamais mis en cache et sera retenté au prochain run).
            try:
                part = cached_json(f"sispea_api/{ind}_{y}", produce, force=force)
            except RuntimeError as e:
                if "HTTP 400" in str(e):
                    print(f"  ! {ind} {y} : HTTP 400 (indicateur ou année invalide), ignoré")
                    part = []
                else:
                    raise
            for r in part:
                r["code_indicateur"] = ind
            rows += part
            n += len(part)
        print(f"  SISPEA API {ind}: {n} lignes")
    return rows


# --- BNPE : volumes prélevés pour l'eau potable, par ouvrage et par an ---
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
        part = cached_json(f"bnvd/{dep}", produce, force=force)
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


# --- VigiEau : niveau de restriction sécheresse en vigueur, par département ---
def vigieau_departements(*, force: bool = True) -> list[dict]:
    """Instantané national (toujours rafraîchi : la donnée change chaque jour)."""
    r = session().get(f"{C.VIGIEAU}/departements", timeout=60)
    r.raise_for_status()
    data = r.json()
    p = C.CACHE / "vigieau" / "departements.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


# --- Sandre : fiche d'un paramètre ---
def sandre_parametre(code: str, *, force: bool = False) -> dict | None:
    def produce():
        r = session().get(f"{C.SANDRE}/par/{code}.json", timeout=60)
        if r.status_code != 200:
            return None
        par = r.json()["REFERENTIELS"]["Referentiel"].get("Parametre")
        return par[0] if isinstance(par, list) else par
    return cached_json(f"sandre/par_{code}", produce, force=force)


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


# Trente ans d'historique suffisent à situer un mois par rapport aux mêmes mois passés (le BRGM en demande 15) ;
# remonter aux années 1970 multipliait le volume téléchargé pour les piézomètres anciens ou à mesures horaires.
PIEZO_DEBUT = "1996-01-01"


def piezo_mensuel(code: str, *, force: bool = False) -> dict:
    """{"mois": {"AAAA-MM": [somme des niveaux, nombre de mesures]}, "fin": dernière date} pour un piézomètre.

    Seules les moyennes mensuelles sont gardées (le brut ferait ~18 millions de lignes pour 2 300 piézomètres).
    Mise à jour incrémentale : on retélécharge depuis le premier jour du dernier mois en cache, recalculé en entier.
    """
    p = C.CACHE / "piezo" / "mensuel" / (code.replace("/", "_") + ".json")
    prev = json.loads(p.read_text(encoding="utf-8")) if p.exists() and not force else None
    if prev and prev.get("maj") == time.strftime("%Y-%m-%d"):
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
    (mesuré : 10 piézomètres/min à 6 connexions, ~17/min à une seule). Le premier chargement prend ~2 h, les
    suivants ne retéléchargent que le dernier mois de chaque piézomètre (cache par piézomètre, reprise possible).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    limite = f"{int(time.strftime('%Y')) - annees_min}-12-31"
    stations = [s for s in piezo_stations(force=force) if (s.get("date_debut_mesure") or "9999") <= limite]
    out: dict[str, dict] = {}
    erreurs = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(piezo_mensuel, s["code_bss"], force=force): s["code_bss"] for s in stations}
        for i, f in enumerate(as_completed(futs), 1):
            try:
                out[futs[f]] = f.result()
            except Exception as e:  # un piézomètre en échec ne bloque pas les autres, mais on le compte
                erreurs += 1
                print(f"  ! {futs[f]} : {e}")
            if i % 200 == 0:
                print(f"  {i}/{len(stations)} piézomètres", flush=True)
    print(f"  piézométrie : {len(out)} piézomètres, {erreurs} en échec")
    if erreurs > len(stations) * 0.05:
        raise RuntimeError(f"piézométrie : {erreurs} piézomètres en échec sur {len(stations)}")
    return out

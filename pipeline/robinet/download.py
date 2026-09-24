"""Téléchargement des sources brutes avec contrôle de fraîcheur.

Chaque fichier téléchargé est inscrit dans data/raw/manifest.json avec une « version » distante
(checksum data.gouv, ETag ou taille). Un fichier déjà présent avec la même version n'est pas retéléchargé.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

from . import config as C

MANIFEST = C.RAW / "manifest.json"


def session() -> requests.Session:
    s = requests.Session()
    s.headers["User-Agent"] = C.USER_AGENT
    return s


def _load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {}


def _save_manifest(m: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")


def fetch(url: str, dest: Path, *, version: str | None = None,
          expected_size: int | None = None, force: bool = False) -> Path:
    """Télécharge `url` vers `dest` sauf si la version distante est déjà celle du manifeste."""
    m = _load_manifest()
    key = dest.relative_to(C.RAW).as_posix()
    entry = m.get(key, {})
    if dest.exists() and not force:
        same_version = version is not None and entry.get("version") == version
        same_size = bool(expected_size) and dest.stat().st_size == expected_size
        if same_version or (not entry and same_size):
            if not entry:  # fichier arrivé hors pipeline : on l'enregistre
                m[key] = {"url": url, "version": version or str(expected_size), "size": dest.stat().st_size,
                          "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
                _save_manifest(m)
            print(f"  = {key} inchangé ({dest.stat().st_size / 1e6:.1f} Mo)")
            return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    t0 = time.time()
    done = 0
    with session().get(url, stream=True, timeout=180) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                done += len(chunk)
    if expected_size and done != expected_size:
        # Une connexion coupée en cours de route laisserait sinon un fichier tronqué remplacer le fichier
        # final et être mis en cache comme « à jour » au prochain run (même version distante).
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"{key}: {done} octets reçus pour {expected_size} attendus (téléchargement interrompu)")
    tmp.replace(dest)
    m[key] = {"url": url, "version": version or str(done), "size": done,
              "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _save_manifest(m)
    print(f"  + {key} {done / 1e6:.1f} Mo en {time.time() - t0:.0f}s")
    return dest


def datagouv_resources(dataset_id: str) -> dict[str, dict]:
    r = session().get(f"{C.DATAGOUV_API}/datasets/{dataset_id}/", timeout=60)
    r.raise_for_status()
    return {res["title"]: res for res in r.json()["resources"]}


def _resource_version(res: dict) -> str | None:
    chk = res.get("checksum") or {}
    return chk.get("value") or res.get("last_modified")


def download_dis(years: list[int], *, force: bool = False) -> list[Path]:
    """Zips annuels du contrôle sanitaire (DIS_PLV, DIS_RESULT, DIS_COM_UDI)."""
    res = datagouv_resources(C.DIS_DATASET_ID)
    out = []
    for y in years:
        title = f"dis-{y}.zip"
        if title not in res:
            print(f"  ! {title} absent de data.gouv")
            continue
        r = res[title]
        out.append(fetch(r["url"], C.RAW / "dis" / title, version=_resource_version(r),
                         expected_size=r.get("filesize"), force=force))
    return out


def download_sispea(years: list[int], *, force: bool = False) -> list[Path]:
    """Extractions annuelles SISPEA eau potable (archives 7z hébergées par l'OFB)."""
    res = datagouv_resources(C.SISPEA_DATASET_ID)
    out = []
    for y in years:
        match = [r for t, r in res.items() if f"_{y}_AEP" in t]
        if not match:
            print(f"  ! SISPEA {y}: aucune extraction publiée")
            continue
        r = match[0]
        h = session().head(r["url"], timeout=60, allow_redirects=True)
        size = int(h.headers.get("Content-Length") or 0) or None
        out.append(fetch(r["url"], C.RAW / "sispea" / f"SISPEA_extraction_{y}_AEP.7z",
                         version=_resource_version(r) or h.headers.get("ETag"), expected_size=size, force=force))
    return out


SISPEA_DOCS = "https://www.services.eaufrance.fr/documents"


def download_sispea_composition(years: list[int], *, force: bool = False) -> list[Path]:
    """Composition communale des services d'eau potable (zip par année, site services.eaufrance.fr).

    C'est la seule source de la correspondance commune ↔ service, indispensable pour rattacher
    prix et rendement à chaque commune. Le listing JSON est celui qu'utilise la page de téléchargement.
    """
    r = session().get(f"{SISPEA_DOCS}/service-members-composition-files.json", timeout=60)
    r.raise_for_status()
    files = {int(f["year"]): f for f in r.json() if f.get("competence") == "EauPotable"}
    out = []
    for y in years:
        f = files.get(y)
        if not f:
            print(f"  ! composition communale {y}: non publiée")
            continue
        url = f"{SISPEA_DOCS}/{f['folder']}/{f['name']}"
        h = session().head(url, timeout=60, allow_redirects=True)
        size = int(h.headers.get("Content-Length") or 0) or None
        out.append(fetch(url, C.RAW / "sispea" / f["name"], version=h.headers.get("Last-Modified") or str(size),
                         expected_size=size, force=force))
    return out


def download_sispea_site(years: list[int], *, force: bool = False) -> list[Path]:
    """Extractions annuelles publiées directement par l'observatoire (zip, jusqu'au millésime en cours).

    Plus récentes que les archives de data.gouv (qui s'arrêtent à 2024) : le site publie 2025 et 2026.
    """
    r = session().get(f"{SISPEA_DOCS}/yearly-extraction-files.json", timeout=60)
    r.raise_for_status()
    files = {int(f["year"]): f for f in r.json()
             if f.get("competence") == "EauPotable" and f.get("fileExtension") == "zip"}
    out = []
    for y in years:
        f = files.get(y)
        if not f:
            print(f"  ! extraction SISPEA site {y}: non publiée")
            continue
        url = f"{SISPEA_DOCS}/{f['folder']}/{f['name']}"
        h = session().head(url, timeout=60, allow_redirects=True)
        size = int(h.headers.get("Content-Length") or 0) or None
        out.append(fetch(url, C.RAW / "sispea" / f["name"], version=h.headers.get("Last-Modified") or str(size),
                         expected_size=size, force=force))
    return out


def download_geo(*, force: bool = False) -> list[Path]:
    """Contours simplifiés à 100 m des départements et des communes (Etalab)."""
    out = []
    for name in ("departements-100m.geojson", "communes-100m.geojson", "communes-1000m.geojson"):
        url = None
        h = None
        for yr in (2025, 2024):
            candidate = C.ETALAB_CONTOURS.format(year=yr, name=name)
            h = session().head(candidate, timeout=60, allow_redirects=True)
            if h.status_code == 200:
                url = candidate
                break
        if url is None or h is None:
            print(f"  ! contours introuvables : {name}")
            continue
        size = int(h.headers.get("Content-Length") or 0) or None
        out.append(fetch(url, C.RAW / "geo" / name, version=h.headers.get("ETag") or str(size),
                         expected_size=size, force=force))
    return out


SECHERESSE_DATASET_ID = "662a5e2cd71b24df5e9a0827"  # « Donnée Sécheresse - VigiEau » (succède à Propluvia)


def download_secheresse(*, force: bool = False) -> Path:
    """Historique des arrêtés de restriction sécheresse depuis 2010 (un fichier, mis à jour chaque jour)."""
    res = datagouv_resources(SECHERESSE_DATASET_ID).get("Arrêtés")
    if res is None:
        raise RuntimeError("ressource « Arrêtés » introuvable dans le jeu Donnée Sécheresse - VigiEau")
    return fetch(res["url"], C.RAW / "secheresse" / "arretes.csv", version=_resource_version(res),
                 expected_size=res.get("filesize"), force=force)


ZRE_WFS = ("https://services.sandre.eaufrance.fr/geo/zrpe?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
           "&typename=sa:ZRE_FXX&SRSNAME=EPSG:4326")


def download_zre(*, force: bool = False) -> Path:
    """Zones de répartition des eaux (déficit structurel ressource/besoins), métropole, en GML (Sandre).

    La sortie GeoJSON du WFS Sandre échoue côté serveur (« Invalid value for FILENAME option ») : on lit le GML.
    """
    dest = C.RAW / "zre" / "zre_fxx.gml"
    if dest.exists() and not force:
        print(f"  = zre/zre_fxx.gml présent ({dest.stat().st_size / 1e6:.1f} Mo)")
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = session().get(ZRE_WFS, timeout=300)
    r.raise_for_status()
    if b"ExceptionReport" in r.content[:600]:
        raise RuntimeError(f"WFS Sandre ZRE : {r.text[:300]}")
    tmp = dest.with_name(dest.name + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    print(f"  + zre/zre_fxx.gml {len(r.content) / 1e6:.1f} Mo")
    return dest

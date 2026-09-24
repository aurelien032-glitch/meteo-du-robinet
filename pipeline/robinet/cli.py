"""Ligne de commande : `uv run robinet <commande>`."""
from __future__ import annotations

import zipfile
from typing import Annotated

import sys

import typer

from . import config as C

# Sortie UTF-8 même quand stdout est redirigé sous Windows (sinon les « → » des messages plantent en cp1252).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

app = typer.Typer(add_completion=False, help="Pipeline eau potable : téléchargement, construction, inspection.")

YearsOpt = Annotated[list[int] | None, typer.Option("--years", "-y", help="Millésimes, ex. -y 2024 -y 2025")]


@app.callback()
def _root() -> None:
    """Pipeline eau potable."""


@app.command()
def download(years: YearsOpt = None, what: str = "all", force: bool = False) -> None:
    """Télécharge les sources brutes (dis | sispea | geo | secheresse | zre | all)."""
    from . import download as D
    years = years or C.DEFAULT_YEARS
    if what in ("dis", "all"):
        print("Contrôle sanitaire (DIS) :")
        D.download_dis(years, force=force)
    if what in ("sispea", "all"):
        print("SISPEA :")
        D.download_sispea([y for y in years if y <= 2024], force=force)
        D.download_sispea_composition(years, force=force)
        D.download_sispea_site(years, force=force)
    if what in ("geo", "all"):
        print("Contours :")
        D.download_geo(force=force)
    if what in ("secheresse", "all"):
        print("Arrêtés sécheresse (historique) :")
        D.download_secheresse(force=force)
    if what in ("zre", "all"):
        print("Zones de répartition des eaux :")
        D.download_zre(force=force)


@app.command("inspect-dis")
def inspect_dis(year: int = 2025, lines: int = 3) -> None:
    """Liste les fichiers d'un zip DIS et affiche leurs premières lignes (détection d'encodage)."""
    path = C.RAW / "dis" / f"dis-{year}.zip"
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            print(f"\n## {info.filename}  ({info.file_size / 1e6:.1f} Mo décompressé)")
            with z.open(info) as f:
                raw = f.read(4000)
            raw = raw[: raw.rfind(b"\n")] if b"\n" in raw else raw
            txt = ""
            for enc in ("utf-8", "cp1252", "latin-1"):
                try:
                    txt = raw.decode(enc)
                    print(f"   encodage probable : {enc}")
                    break
                except UnicodeDecodeError:
                    continue
            for ln in txt.splitlines()[:lines]:
                print("   |", ln[:300])


@app.command()
def api(what: str = "all", force: bool = False) -> None:
    """Interroge les APIs (sispea | bnpe | bnvd | ades | naiades | piezo | vigieau | all) et met les réponses en cache dans data/cache/."""
    from . import apis as A
    if what in ("sispea", "all"):
        print("SISPEA historique 2008-2019 via Hub'Eau :")
        rows = A.sispea_history(force=force)
        print(f"  total : {len(rows)} lignes")
    if what in ("bnpe", "all"):
        print("BNPE prélèvements eau potable :")
        rows = A.bnpe_aep(force=force)
        print(f"  total : {len(rows)} lignes")
        A.bnpe_ouvrages(force=force)
    if what in ("bnvd", "all"):
        print("BNV-D ventes de pesticides :")
        A.bnvd_ventes_departement(force=force)
    if what in ("ades", "all"):
        print("ADES nitrates et pesticides dans les nappes :")
        for code in ("1340", "6276"):
            rows = A.ades_param_departement(code, force=force)
            print(f"  paramètre {code} : {len(rows)} analyses")
    if what in ("naiades", "all"):
        print("Naïades nitrates et pesticides dans les rivières :")
        for code in ("1340", "6276"):
            rows = A.naiades_param_departement(code, force=force)
            print(f"  paramètre {code} : {len(rows)} analyses")
    if what in ("piezo", "all"):
        print("Piézométrie (niveau des nappes), moyennes mensuelles :")
        A.piezo_tous(force=force)
    if what in ("vigieau", "all"):
        print("VigiEau :")
        print(f"  {len(A.vigieau_departements())} départements")


@app.command()
def sispea(years: YearsOpt = None) -> None:
    """Charge les extractions SISPEA et la composition communale, puis produit les fichiers du site."""
    from . import build_sispea, sispea as S
    years = years or C.DEFAULT_YEARS
    print("Extractions annuelles :")
    S.to_parquet(years)
    print("Composition communale :")
    S.composition_to_parquet(years)
    print("Fichiers du site :")
    build_sispea.run(years)


@app.command()
def recherche() -> None:
    """Index de la recherche unique (communes, services d'eau, réseaux) → recherche/*.json. Après `build` et `sispea`."""
    from . import recherche as R
    R.run()


@app.command()
def check(strict: bool = False) -> None:
    """Compare les totaux nationaux d'un millésime au précédent ; --strict échoue si un écart dépasse la tolérance."""
    from . import check as K
    K.run(strict=strict)


@app.command()
def avis(years: YearsOpt = None) -> None:
    """Avis sanitaires de l'ARS (conclusions des prélèvements) → avis/*.json, puis tout ce qui dépend de leur
    classement : situations des réseaux (situations/*.json) et colonnes avis et situations de la carte (map/*.json)."""
    from . import avis as V
    from . import build as B
    from . import situations as S
    years = [y for y in (years or C.DEFAULT_YEARS) if (B.AGG / str(y) / ".complete").exists()]
    con = B.connect()
    B._views(con, years)
    V.charger(con, years)
    codes = S.build(con, years)
    B.build_maps(con, years, codes)
    V.publier(con, years)


@app.command()
def amont() -> None:
    """Prélèvements, ventes de pesticides et nappes (depuis le cache des APIs) → fichiers du site."""
    from . import build_amont
    build_amont.run()


@app.command()
def ressource() -> None:
    """Historique des restrictions sécheresse, niveau des nappes et pression sur la ressource → fichiers du site."""
    from . import build_nappes, build_ressource, build_secheresse
    print("Restrictions sécheresse, historique :")
    build_secheresse.run()
    print("Niveau des nappes :")
    build_nappes.run()
    print("Pression sur la ressource :")
    build_ressource.run()


@app.command()
def geo() -> None:
    """Découpe les contours Etalab en fichiers GeoJSON du site, puis dessine la carte SVG de l'accueil."""
    from . import geo as G
    from . import geo_svg
    G.run()
    geo_svg.run()


@app.command()
def build(years: YearsOpt = None, force: bool = False) -> None:
    """Construit les Parquet intermédiaires et les fichiers statiques du site."""
    from . import build as B
    B.run(years or C.DEFAULT_YEARS, force=force)


if __name__ == "__main__":
    app()

"""Conversion des zips annuels du contrôle sanitaire (DIS) en Parquet.

Chaque zip contient trois fichiers texte : DIS_PLV (prélèvements), DIS_RESULT (résultats d'analyse)
et DIS_COM_UDI (communes ↔ unités de distribution). Ils sont lus en texte par DuckDB, typés
colonne par colonne, puis écrits en Parquet compressé. Le texte extrait est supprimé aussitôt.
"""
from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import duckdb

from . import config as C

TABLES = {"DIS_PLV": "plv", "DIS_RESULT": "result", "DIS_COM_UDI": "com_udi"}

# Colonnes converties si présentes ; tout le reste reste en texte.
NUMERIC = {"valtraduite", "pourcentdebit"}


def _table_of(member: str) -> str | None:
    base = Path(member).name.upper()
    for prefix, table in TABLES.items():
        if base.startswith(prefix + "_"):
            return table
    return None


def _detect_encoding(z: zipfile.ZipFile, member: str) -> str:
    with z.open(member) as f:
        raw = f.read(1 << 20)
    try:
        raw.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        return "latin-1"


def parquet_paths(year: int) -> dict[str, Path]:
    d = C.OUT / "dis" / str(year)
    return {t: d / f"{t}.parquet" for t in TABLES.values()}


def version_source(year: int) -> str | None:
    """Version de l'archive du millésime : celle que le téléchargement a inscrite au manifeste (empreinte publiée par
    data.gouv), sinon taille et date du fichier ; None sans archive."""
    zip_path = C.RAW / "dis" / f"dis-{year}.zip"
    if not zip_path.exists():
        return None
    try:
        v = json.loads((C.RAW / "manifest.json").read_text(encoding="utf-8")).get(f"dis/dis-{year}.zip", {}).get("version")
    except (OSError, ValueError):
        v = None
    st = zip_path.stat()
    return v or f"{st.st_size}-{int(st.st_mtime)}"


def to_parquet(year: int, *, force: bool = False) -> dict[str, Path]:
    zip_path = C.RAW / "dis" / f"dis-{year}.zip"
    if not zip_path.exists():
        raise FileNotFoundError(f"{zip_path} : lancer `robinet download --what dis -y {year}`")
    out_dir = C.OUT / "dis" / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Les Parquet portent la version de l'archive dont ils viennent : data.gouv republie chaque mois l'archive de
    # l'année en cours (et parfois les précédentes) sous le même nom ; sans ce repère, la nouvelle archive était
    # téléchargée puis ignorée, les Parquet de la précédente étant « présents ».
    source = out_dir / ".source"
    version = version_source(year)
    if not force and (not source.exists() or source.read_text(encoding="utf-8").strip() != version):
        print(f"  dis {year} : nouvelle archive ({version}), conversion")
        force = True
    tmp_dir = C.CACHE / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    outputs: dict[str, Path] = {}
    with zipfile.ZipFile(zip_path) as z:
        for member in z.namelist():
            table = _table_of(member)
            if table is None:
                continue
            dest = out_dir / f"{table}.parquet"
            outputs[table] = dest
            if dest.exists() and not force:
                print(f"  = dis {year}/{table}.parquet présent")
                continue
            enc = _detect_encoding(z, member)
            tmp = tmp_dir / Path(member).name
            with z.open(member) as src, open(tmp, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 22)
            try:
                con = duckdb.connect()
                csv = (f"read_csv('{tmp.as_posix()}', header=true, delim=',', quote='\"', escape='\"', "
                       f"all_varchar=true, encoding='{enc}', null_padding=true, strict_mode=false, "
                       f"parallel=false)")  # champs multi-lignes : le lecteur parallèle refuse le fichier
                cols = [r[0] for r in con.execute(f"DESCRIBE SELECT * FROM {csv}").fetchall()]
                # « 100 % » ou « 0,5 » → 100.0 / 0.5 : on ne garde que chiffres, signe et séparateur décimal.
                proj = ", ".join(
                    f"TRY_CAST(replace(regexp_replace(\"{c}\", '[^0-9,.-]', '', 'g'), ',', '.') AS DOUBLE) AS \"{c}\""
                    if c in NUMERIC else f'"{c}"'
                    for c in cols
                )
                # Écriture atomique : un échec en cours de route ne laisse pas de Parquet tronqué « présent ».
                part = dest.with_name(dest.stem + ".part.parquet")
                con.execute(f"COPY (SELECT {proj} FROM {csv}) TO '{part.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
                n = con.execute(f"SELECT count(*) FROM read_parquet('{part.as_posix()}')").fetchone()[0]
                con.close()
                part.replace(dest)
                print(f"  + dis {year}/{table}.parquet : {n:,} lignes, {dest.stat().st_size / 1e6:.0f} Mo, "
                      f"encodage {enc}, {len(cols)} colonnes")
            finally:
                tmp.unlink(missing_ok=True)
    source.write_text(version or "", encoding="utf-8")
    return outputs

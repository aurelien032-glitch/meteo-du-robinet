"""Extractions annuelles SISPEA eau potable (xls / xlsx dans des archives 7z) → Parquet normalisé.

Chaque millésime a ses propres en-têtes (libellés longs en 2024, snake_case en 2023) : on les ramène
à un schéma unique. Les colonnes nominatives (courriels des agents) ne sont jamais reprises.
Une ligne = un service (entité de gestion) pour une année.
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path

import pandas as pd
import py7zr

from . import config as C

# Colonnes descriptives : nom normalisé → variantes d'en-tête rencontrées selon les millésimes.
DESC: dict[str, list[str]] = {
    "dept": ["DPT du siège de la coll.", "dpt"],
    "id_coll": ["Id SISPEA de la collectivité", "id_sispea_coll"],
    "nom_coll": ["Nom collectivité", "nom_coll"],
    "type_coll": ["Type collectivité", "type_coll"],
    "siren": ["N° SIREN", "N_SIREN"],
    "insee_commune": ["N° INSEE si commune", "N_INSEE_si_commune"],
    "nb_communes_coll": ["Communes membres de la coll", "Communes_adh_de_la_coll"],
    "id_service": ["Id SISPEA de l'entité de gestion", "id_sispea_serv"],
    "code_uge": ["Code UGE de l'entité de gestion", "Code_UGE_serv"],
    "nom_service": ["Nom de l'entité de gestion", "Nom_serv"],
    "nb_communes_service": ["Communes adhérentes de l'entité de gestion", "Communes_adh_du_serv"],
    "pop_communes": ["Pop communes adhérentes", "pop_comm_adh"],
    "pop_desservie": ["Pop de l'entité de gestion sans double compte", "psdc"],
    "production": ["Production", "production"],
    "transfert": ["Transfert", "transfert"],
    "distribution": ["Distribution", "distribution"],
    "mode_gestion": ["Mode de gestion", "mode_gestion"],
    "statut_operateur": ["Statut de l'opérateur", "statut_operateur"],
    "nom_operateur": ["Nom de l'opérateur", "nom_operateur"],
    "nb_ouvrages_prelevement": ["Nb d'ouvrages - Prélèvement", "Nb_douvrages_Prelevement"],
    "statut": ["Statut"],
}
NUMERIC_DESC = {"nb_communes_coll", "nb_communes_service", "pop_communes", "pop_desservie", "nb_ouvrages_prelevement"}

# Indicateurs et variables : D102.0 / d102_0 / p103_2b / VP.056 / vp_056 / DC.184 → D102.0, P103.2B, VP.056, DC.184
IND_RE = re.compile(r"^(d|p|vp|dc)[._]?(\d{3})(?:[._](\d[a-z]?))?$", re.I)

# Libellés courts des indicateurs réglementaires utilisés par le site.
INDICATEURS = {
    "D101.0": "Habitants desservis",
    "D102.0": "Prix TTC du m³ pour 120 m³ (€)",
    "D151.0": "Délai maximal d'ouverture des branchements (j)",
    "P101.1": "Conformité microbiologique (%)",
    "P102.1": "Conformité physico-chimique (%)",
    "P103.2B": "Connaissance et gestion patrimoniale (/120)",
    "P104.3": "Rendement du réseau de distribution (%)",
    "P105.3": "Indice linéaire des volumes non comptés (m³/km/j)",
    "P106.3": "Indice linéaire de pertes en réseau (m³/km/j)",
    "P107.2": "Taux moyen de renouvellement des réseaux (%)",
    "P108.3": "Avancement de la protection de la ressource (%)",
    "P109.0": "Abandons de créances (€/m³)",
    "P151.1": "Interruptions de service non programmées (/1000 abonnés)",
    "P152.1": "Respect du délai d'ouverture des branchements (%)",
    "P153.2": "Durée d'extinction de la dette (années)",
    "P154.0": "Taux d'impayés (%)",
    "P155.1": "Taux de réclamations (/1000 abonnés)",
}


def _norm_code(col: str) -> str | None:
    m = IND_RE.match(str(col).strip())
    if not m:
        return None
    prefix, num, suffix = m.group(1).upper(), m.group(2), m.group(3)
    sep = "." if len(prefix) == 2 else ""  # VP.056 / DC.184 mais D102.0 / P104.3
    return f"{prefix}{sep}{num}" + (f".{suffix.upper()}" if suffix else "")


def _clean_code(s: pd.Series, width: int | None = None) -> pd.Series:
    """« 1010.0 » → « 01010 », « . » → NA. Les codes lus depuis Excel arrivent parfois en nombre."""
    s = s.astype("string").str.strip().str.replace(r"\.0$", "", regex=True)
    s = s.mask(s.isin([".", "", "nan", "None", "<NA>"]))
    if width:
        s = s.where(~s.str.fullmatch(r"\d+", na=False), s.str.zfill(width))
    return s


def _clean_dept(s: pd.Series) -> pd.Series:
    s = _clean_code(s)
    # « 001 » → « 01 », « 8 » → « 08 », « 02A » → « 2A », « 971 » inchangé
    s = s.where(~(s.str.len().eq(3) & s.str.startswith("0")), s.str[1:])
    s = s.where(~s.str.fullmatch(r"\d", na=False), "0" + s)
    return s


def _extract(year: int) -> Path:
    """Fichier Excel du millésime : zip du site de l'observatoire (prioritaire, plus récent), sinon 7z data.gouv."""
    tmp = C.CACHE / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    site_zip = C.RAW / "sispea" / f"SISPEA_FR_{year}_AEP.zip"
    if site_zip.exists():
        with zipfile.ZipFile(site_zip) as z:
            names = [n for n in z.namelist() if n.lower().endswith((".xls", ".xlsx"))]
            if not (tmp / names[0]).exists():
                z.extract(names[0], tmp)
        return tmp / names[0]
    archive = C.RAW / "sispea" / f"SISPEA_extraction_{year}_AEP.7z"
    if not archive.exists():
        raise FileNotFoundError(f"{archive} : lancer `robinet download --what sispea -y {year}`")
    with py7zr.SevenZipFile(archive) as z:
        names = [n for n in z.getnames() if n.lower().endswith((".xls", ".xlsx"))]
        if not names:
            raise RuntimeError(f"{archive} ne contient pas de fichier Excel")
        if not (tmp / names[0]).exists():
            z.extract(tmp, targets=names[:1])
    return tmp / names[0]


def load_year(year: int) -> pd.DataFrame:
    path = _extract(year)
    xl = pd.ExcelFile(path)
    if "Entités de gestion" in xl.sheet_names:
        sheet = "Entités de gestion"
    else:
        sheet = [s for s in xl.sheet_names if "metadonn" not in s.lower()][0]
    df = xl.parse(sheet, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    out = pd.DataFrame({"annee": [year] * len(df)})
    lower = {c.lower(): c for c in df.columns}
    for norm, variants in DESC.items():
        # les en-têtes changent de casse d'un millésime à l'autre (« N_SIREN » en 2023, « n_siren » en 2020)
        col = next((lower[v.lower()] for v in variants if v.lower() in lower), None)
        if col is None:
            out[norm] = pd.Series([pd.NA] * len(df), dtype="string")
            continue
        s = df[col]
        if norm in NUMERIC_DESC:
            out[norm] = pd.to_numeric(s.str.replace(",", ".", regex=False), errors="coerce")
        elif norm == "insee_commune":
            out[norm] = _clean_code(s, 5)
        elif norm == "dept":
            out[norm] = _clean_dept(s)
        elif norm == "siren":
            out[norm] = _clean_code(s, 9)
        else:
            out[norm] = s.astype("string").str.strip()
    for col in df.columns:
        code = _norm_code(col)
        if code is not None:
            out[code] = pd.to_numeric(df[col].str.replace(",", ".", regex=False), errors="coerce")
    return out


def to_parquet(years: list[int], *, force: bool = False) -> Path:
    dest = C.OUT / "sispea" / "services.parquet"
    dest.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    for y in years:
        try:
            df = load_year(y)
        except FileNotFoundError as e:
            print(f"  ! {e}")
            continue
        n_ind = sum(1 for c in df.columns if IND_RE.match(c) or c in INDICATEURS)
        print(f"  + SISPEA {y} : {len(df):,} services, {n_ind} indicateurs/variables")
        frames.append(df)
    all_df = pd.concat(frames, ignore_index=True)
    all_df.to_parquet(dest, index=False)
    return dest


# --- Composition communale : commune ↔ service d'eau potable, par année ---------------------------
COMP_COLS = {
    "annee": "Année",
    "insee": "Code INSEE de la commune adhérente",
    "nom_commune": "Nom de la commune adhérente",
    "population": "Population de la commune",
    "secteur": "Secteur desservi",
    "id_service": "Identifiant SISPEA de l'entité de gestion à laquelle la commune adhère",
    "nom_service": "Nom de l'entité de gestion à laquelle la commune adhère",
    "code_uge": "Code UGE (eau potabe)",
    "id_coll": "Identifiant SISPEA de la collectivité de l'entité de gestion à laquelle la commune adhère",
    "nom_coll": "Nom de la collectivité de l'entité de gestion à laquelle la commune adhère",
    "type_coll": "Type de collectivité",
    "mode_gestion": "Type du mode de gestion",
    "statut_operateur": "Statut de l'opérateur",
    "nom_operateur": "Nom de l'opérateur",
    "statut_donnees": "Statut des données de cette entité de gestion",
    "production": "Production",
    "distribution": "Distribution",
}


def load_composition(year: int) -> pd.DataFrame:
    archive = C.RAW / "sispea" / f"CompositionCommunaleServices_AEP_{year}.zip"
    if not archive.exists():
        raise FileNotFoundError(f"{archive} : lancer `robinet download --what sispea -y {year}`")
    with zipfile.ZipFile(archive) as z:
        name = [n for n in z.namelist() if n.lower().endswith((".xls", ".xlsx"))][0]
        with z.open(name) as f:
            df = pd.read_excel(f, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    out = pd.DataFrame()
    for norm, col in COMP_COLS.items():
        match = next((c for c in df.columns if c.strip() == col.strip()), None)
        s = df[match] if match else pd.Series([pd.NA] * len(df), dtype="string")
        if norm == "insee":
            out[norm] = _clean_code(s, 5)
        elif norm in ("annee", "population"):
            out[norm] = pd.to_numeric(s, errors="coerce")
        elif norm in ("id_service", "id_coll", "code_uge"):
            out[norm] = _clean_code(s)
        else:
            out[norm] = s.astype("string").str.strip().mask(s.isin(["-", "."]))
    out["annee"] = out["annee"].fillna(year).astype(int)
    return out


def composition_to_parquet(years: list[int]) -> Path:
    dest = C.OUT / "sispea" / "composition.parquet"
    dest.parent.mkdir(parents=True, exist_ok=True)
    frames = []
    for y in years:
        try:
            df = load_composition(y)
        except FileNotFoundError as e:
            print(f"  ! {e}")
            continue
        print(f"  + composition {y} : {len(df):,} lignes, {df['insee'].nunique():,} communes, {df['id_service'].nunique():,} services")
        frames.append(df)
    all_df = pd.concat(frames, ignore_index=True)
    all_df.to_parquet(dest, index=False)
    return dest

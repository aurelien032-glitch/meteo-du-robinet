"""Ligne de commande : années SISPEA traitées, avec ou sans -y."""
from datetime import date

import pytest
from typer.testing import CliRunner

from robinet import build_sispea, cli, sispea

TOUTES = list(range(2020, date.today().year + 1))


@pytest.fixture
def recues(monkeypatch):
    """Années reçues par les trois étapes de `robinet sispea`, sans rien écrire."""
    recues = {}
    monkeypatch.setattr(sispea, "to_parquet", lambda years: recues.setdefault("services", years))
    monkeypatch.setattr(sispea, "composition_to_parquet", lambda years: recues.setdefault("composition", years))
    monkeypatch.setattr(build_sispea, "run", lambda years: recues.setdefault("site", years))
    return recues


def test_sispea_sans_annees_reprend_toutes_les_extractions(recues):
    # `robinet sispea` réécrit ses fichiers avec les seules années reçues : avec les quatre millésimes du contrôle
    # sanitaire (DEFAULT_YEARS), il effaçait 2020-2022 de sispea/national.json et de /services (constat du 25/09).
    res = CliRunner().invoke(cli.app, ["sispea"])
    assert res.exit_code == 0, res.output
    assert recues == {"services": TOUTES, "composition": TOUTES, "site": TOUTES}


def test_sispea_liste_complete_explicite_acceptee(recues):
    # Celle de scripts/refresh.ps1 : -y 2020 … -y <année en cours>.
    res = CliRunner().invoke(cli.app, ["sispea", *[a for y in TOUTES for a in ("-y", str(y))]])
    assert res.exit_code == 0, res.output
    assert recues["services"] == TOUTES


def test_sispea_refuse_une_liste_partielle_avant_toute_ecriture(recues):
    res = CliRunner().invoke(cli.app, ["sispea", "-y", "2025"])
    assert res.exit_code == 1
    assert recues == {}
    assert "perdraient 2020, 2021, 2022, 2023, 2024" in res.output and "--partiel" in res.output


def test_sispea_liste_partielle_acceptee_avec_partiel(recues):
    res = CliRunner().invoke(cli.app, ["sispea", "-y", "2025", "--partiel"])
    assert res.exit_code == 0, res.output
    assert recues == {"services": [2025], "composition": [2025], "site": [2025]}


def test_janvier_sans_archive_de_l_annee_nouvelle(tmp_path, monkeypatch):
    """Janvier : l'archive du contrôle sanitaire de l'année nouvelle n'est pas publiée. La construction de cette seule
    année ne réécrit rien (elle écrivait des fichiers du site sans millésime), et la fenêtre par défaut garde les quatre
    derniers millésimes présents au lieu de perdre le plus ancien."""
    from robinet import build as B
    from robinet import config as C
    monkeypatch.setattr(C, "RAW", tmp_path / "raw")
    monkeypatch.setattr(C, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(C, "WEB_DATA", tmp_path / "web")
    B.run([2099])
    assert not (tmp_path / "web").exists()
    (tmp_path / "raw" / "dis").mkdir(parents=True)
    for a in (2021, 2022, 2023, 2024, 2025):
        (tmp_path / "raw" / "dis" / f"dis-{a}.zip").write_bytes(b"")
    assert C.millesimes_publies() == [2022, 2023, 2024, 2025]

"""Archive DIS republiée (revue du 04/10) : les Parquet et les agrégats suivent la version de l'archive téléchargée."""
import json
import zipfile

import pytest

from robinet import agregats as B
from robinet import config as C
from robinet import dis


@pytest.fixture
def dossiers(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "RAW", tmp_path / "raw")
    monkeypatch.setattr(C, "OUT", tmp_path / "out")
    monkeypatch.setattr(C, "CACHE", tmp_path / "cache")
    monkeypatch.setattr(B, "AGG", tmp_path / "out" / "agg")
    (tmp_path / "raw" / "dis").mkdir(parents=True)
    return tmp_path


def _archive(racine, version, lignes="referenceprel,cddept\nP1,035\n"):
    with zipfile.ZipFile(racine / "raw" / "dis" / "dis-2026.zip", "w") as z:
        z.writestr("DIS_PLV_2026.txt", lignes)
    (racine / "raw" / "manifest.json").write_text(json.dumps({"dis/dis-2026.zip": {"version": version}}), encoding="utf-8")


def test_version_source(dossiers):
    assert dis.version_source(2026) is None
    _archive(dossiers, "abc")
    assert dis.version_source(2026) == "abc"
    (dossiers / "raw" / "manifest.json").unlink()
    assert dis.version_source(2026).count("-") == 1  # taille-date, sans manifeste


def test_nouvelle_archive_reconvertie(dossiers, capsys):
    _archive(dossiers, "v1")
    dis.to_parquet(2026)
    assert "nouvelle archive (v1)" in capsys.readouterr().out
    dis.to_parquet(2026)
    assert "présent" in capsys.readouterr().out
    _archive(dossiers, "v2", "referenceprel,cddept\nP1,035\nP2,035\n")
    dis.to_parquet(2026)
    sortie = capsys.readouterr().out
    assert "nouvelle archive (v2)" in sortie and "2 lignes" in sortie


def test_agregat_perime_si_archive_ou_code_change(dossiers):
    _archive(dossiers, "v1")
    sentinelle = B.AGG / "2026" / ".complete"
    sentinelle.parent.mkdir(parents=True)
    sentinelle.write_text(f"{B.AGG_VERSION} v1 2026-10-04T12:00:00", encoding="utf-8")
    assert B.agregat_a_jour(2026)
    _archive(dossiers, "v2")
    assert not B.agregat_a_jour(2026)
    sentinelle.write_text(f"{B.AGG_VERSION - 1} v2 2026-10-04T12:00:00", encoding="utf-8")
    assert not B.agregat_a_jour(2026)

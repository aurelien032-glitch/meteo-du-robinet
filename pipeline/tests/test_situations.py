"""Fichiers des situations lus par le site."""
import json

from robinet import config as C
from robinet.situations import ecrire_depts


def test_depts_json_repartitions_par_annee_sans_les_codes_des_reseaux(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "WEB_DATA", tmp_path)
    ecrire_depts({"2024": {"35": {"toutes": [80, 9, 0, 0]}}, "2025": {"35": {"toutes": [86, 7, 0, 0], "azote": [60, 20, 13, 0]}}})
    ecrit = json.loads((tmp_path / "situations" / "depts.json").read_text(encoding="utf-8"))
    assert ecrit == {"2024": {"35": {"toutes": [80, 9, 0, 0]}}, "2025": {"35": {"toutes": [86, 7, 0, 0], "azote": [60, 20, 13, 0]}}}
    # Reconstruction d'une seule année : elle remplace la sienne, les autres restent, dans l'ordre des années.
    ecrire_depts({"2026": {"35": {"toutes": [40, 2, 1, 0]}}, "2025": {"35": {"toutes": [86, 8, 0, 0]}}})
    ecrit = json.loads((tmp_path / "situations" / "depts.json").read_text(encoding="utf-8"))
    assert list(ecrit) == ["2024", "2025", "2026"]
    assert ecrit["2025"] == {"35": {"toutes": [86, 8, 0, 0]}} and ecrit["2024"] == {"35": {"toutes": [80, 9, 0, 0]}}

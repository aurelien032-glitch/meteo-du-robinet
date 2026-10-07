"""Fichiers des situations lus par le site."""
import json

from robinet import config as C
from robinet.situations import ecrire_depts, non_conforme, toutes


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


def test_pfas_non_conforme_des_2023():
    """Choix de l'auteur (2026-10-04, note DGS/EA4/2023/61) : la limite des PFAS s'applique depuis 2023 ; un
    dépassement est une non-conformité dans « toutes familles », la restriction de l'ARS une restriction."""
    pfas_seul = {"pesticides": 0, "azote": 0, "pfas": 1, "microbio": 0, "metaux_mineraux": 0}
    assert toutes(pfas_seul) == 1
    assert toutes({**pfas_seul, "pfas": 2}) == 2
    assert non_conforme("pfas", 1) and non_conforme("metaux_mineraux", 1) and not non_conforme("pfas", 0)

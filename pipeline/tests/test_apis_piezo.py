"""Piézométrie : seuls les piézomètres qui ont publié une mesure depuis la dernière mise à jour sont retéléchargés."""
import json

import pytest

from robinet import apis as A
from robinet import config as C


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CACHE", tmp_path)
    d = tmp_path / "piezo" / "mensuel"
    d.mkdir(parents=True)
    # Mis à jour il y a une semaine : la garde du « même jour » ne joue pas.
    (d / "BSS001_X.json").write_text(json.dumps({"mois": {"2026-08": [30.0, 3], "2026-09": [20.0, 2]}, "fin": "2026-09-21",
                                                 "maj": "2026-09-21"}), encoding="utf-8")
    return d


def test_rien_de_publie_depuis_le_cache_pas_de_requete(cache, monkeypatch):
    def interdit(*a, **k):
        raise AssertionError("aucune requête attendue")
    monkeypatch.setattr(A, "_piezo_mesures", interdit)
    r = A.piezo_mensuel("BSS001/X", fin_publiee="2026-09-21")
    assert r["fin"] == "2026-09-21" and r["mois"]["2026-09"] == [20.0, 2]


def test_mesure_nouvelle_retelecharge_le_dernier_mois(cache, monkeypatch):
    appels = []

    def mesures(code, debut):
        appels.append((code, debut))
        return [{"date_mesure": "2026-09-10", "niveau_nappe_eau": 10.0}, {"date_mesure": "2026-09-28", "niveau_nappe_eau": 12.0}]
    monkeypatch.setattr(A, "_piezo_mesures", mesures)
    r = A.piezo_mensuel("BSS001/X", fin_publiee="2026-09-28T00:00:00Z")
    assert appels == [("BSS001/X", "2026-09-01")]
    # Le dernier mois est recalculé en entier, les précédents sont gardés.
    assert r["mois"] == {"2026-08": [30.0, 3], "2026-09": [22.0, 2]}
    assert r["fin"] == "2026-09-28"
    assert json.loads((cache / "BSS001_X.json").read_text(encoding="utf-8"))["fin"] == "2026-09-28"


def test_sans_date_publiee_on_retelecharge(cache, monkeypatch):
    appels = []
    monkeypatch.setattr(A, "_piezo_mesures", lambda code, debut: appels.append(debut) or [])
    A.piezo_mensuel("BSS001/X", fin_publiee=None)
    assert appels == ["2026-09-01"]


def test_piezo_tous_relit_la_liste_et_ne_demande_que_les_nouveaux(cache, monkeypatch, capsys):
    forces = []

    def stations(*, force=False):
        forces.append(force)
        return [
            {"code_bss": "BSS001/X", "date_debut_mesure": "1990-01-01", "date_fin_mesure": "2026-09-21"},
            {"code_bss": "BSS002/Y", "date_debut_mesure": "1990-01-01", "date_fin_mesure": "2026-09-27"},
        ]
    demandes = []

    def mesures(code, debut):
        demandes.append(code)
        return [{"date_mesure": "2026-09-27", "niveau_nappe_eau": 5.0}]
    monkeypatch.setattr(A, "piezo_stations", stations)
    monkeypatch.setattr(A, "_piezo_mesures", mesures)
    out = A.piezo_tous()
    assert forces == [True]
    assert demandes == ["BSS002/Y"]
    assert set(out) == {"BSS001/X", "BSS002/Y"}
    assert "2 piézomètres, dont 1 avec une mesure nouvelle, 0 en échec" in capsys.readouterr().out


def test_coupure_de_la_liste_des_stations_liste_en_cache(cache, monkeypatch, capsys):
    appels = []

    def stations(*, force=False):
        appels.append(force)
        if force:
            raise ConnectionError("Remote end closed connection without response")
        return [{"code_bss": "BSS001/X", "date_debut_mesure": "1990-01-01", "date_fin_mesure": "2026-09-21"}]
    monkeypatch.setattr(A, "piezo_stations", stations)
    monkeypatch.setattr(A, "_piezo_mesures", lambda code, debut: [])
    out = A.piezo_tous()
    assert appels == [True, False]
    assert set(out) == {"BSS001/X"}
    assert "liste en cache" in capsys.readouterr().out

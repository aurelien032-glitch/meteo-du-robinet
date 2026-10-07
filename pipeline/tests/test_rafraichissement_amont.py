"""Sources amont (BNPE, BNV-D, ADES, Naïades) : rafraîchissement mensuel, une source entière à la fois (04/10)."""
import json
import os
import time

import pytest

from robinet import apis as A
from robinet import config as C


@pytest.fixture
def cache(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "CACHE", tmp_path)
    monkeypatch.setattr(C, "DEPARTEMENTS", ["01", "02", "03", "04"])
    d = tmp_path / "src"
    d.mkdir()
    return d


def _fichiers(d, ages):
    maintenant = time.time()
    for dd, jours in ages.items():
        p = d / f"{dd}.json"
        p.write_text(json.dumps([{"dd": dd, "v": "ancien"}]), encoding="utf-8")
        os.utime(p, (maintenant - jours * 86400, maintenant - jours * 86400))


def test_toute_la_source_des_qu_un_cache_a_plus_de_30_jours(cache):
    _fichiers(cache, {"01": 10, "02": 40, "03": 5, "04": 2})
    assert A.a_rafraichir("src") == {"01", "02", "03", "04"}


def test_rien_tant_que_tous_les_caches_sont_recents(cache):
    _fichiers(cache, {"01": 10, "02": 20, "03": 5, "04": 29})
    assert A.a_rafraichir("src") == set()
    assert A.a_rafraichir("absente") == set()


def test_reprise_et_repli_sur_le_cache(cache, capsys):
    _fichiers(cache, {"01": 40, "02": 40, "03": 40, "04": 40})
    assert A.cache_rafraichi("src/02", lambda: [{"v": "neuf"}], rafraichir=True) == [{"v": "neuf"}]

    def coupure():
        raise ConnectionError("coupure")
    assert A.cache_rafraichi("src/04", coupure, rafraichir=True) == [{"dd": "04", "v": "ancien"}]
    assert "cache gardé" in capsys.readouterr().out
    assert A.cache_rafraichi("src/03", coupure, rafraichir=False) == [{"dd": "03", "v": "ancien"}]

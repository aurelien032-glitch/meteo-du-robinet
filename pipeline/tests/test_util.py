"""Utilitaires communs du pipeline (revue du 04/10) : sorties reproductibles à l'octet près."""
from decimal import Decimal

import duckdb

from robinet import config as C
from robinet import util as U


def test_dump_trie_les_cles_et_ecrit_les_decimal(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "ROOT", tmp_path)
    p = tmp_path / "a.json"
    U.dump(p, {"b": 1, "a": {"d": Decimal("1.5"), "c": 2}}, silencieux=True)
    assert p.read_text(encoding="utf-8") == '{"a":{"c":2,"d":1.5},"b":1}'


def test_arrondi():
    assert [U.arrondi(1.23456), U.arrondi(Decimal("2.5"), 0), U.arrondi(float("nan")), U.arrondi(None), U.arrondi(3)] == [1.235, 2.0, None, None, 3]


def test_codes_de_departement():
    assert [U.dept_of_insee(c) for c in ("01004", "2A004", "97105", "97701", "97411")] == ["01", "2A", "971", "971", "974"]
    assert [U.dept_site(c) for c in ("001", "02A", "035", "971", "75")] == ["01", "2A", "35", "971", "75"]


def test_valeur_la_plus_frequente_departagee():
    con = duckdb.connect()
    con.execute("""CREATE TABLE t AS SELECT * FROM (VALUES ('R1', '%'), ('R1', 'n(colonies)/mL'), ('R2', 'B'), ('R2', 'A'),
                   ('R2', 'B'), ('R3', NULL)) v(r, u)""")
    assert con.execute(U.sql_modes("t", "r", {"u": "u"}) + " ORDER BY 1").fetchall() == [("R1", "%"), ("R2", "B")]

"""Séries mensuelles par réseau (choix de l'auteur du 03/10) : ce qui est publié, ce qui ne l'est pas."""
import duckdb

from robinet import series as B


def _con(lignes):
    con = duckdb.connect()
    con.execute("""CREATE TABLE reseau_month_param (cdreseau VARCHAR, annee INTEGER, mois INTEGER, cdparametre VARCHAR,
                   famille VARCHAR, n BIGINT, n_dep BIGINT, n_quant BIGINT, vmax DOUBLE)""")
    con.executemany("INSERT INTO reseau_month_param VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", lignes)
    con.execute("CREATE TABLE reseau_info AS SELECT 'R' AS cdreseau, '035' AS cddept, 2025 AS annee")
    return con


def test_series_publiees():
    con = _con([
        ("R", 2025, 3, "6276", "pesticides", 1, 0, 0, 0.0),      # total des pesticides, jamais quantifié : publié
        ("R", 2025, 3, "1101", "pesticides", 1, 0, 0, 0.0),      # pesticide jamais quantifié : écarté
        ("R", 2025, 4, "1107", "pesticides", 1, 0, 1, 0.02),     # quantifié une fois : publié, tous ses mois analysés
        ("R", 2025, 5, "1107", "pesticides", 1, 0, 0, 0.0),
        ("R", 2025, 2, "1335", "azote", 2, 0, 1, 0.05),          # ammonium quantifié : publié (famille du détail)
        ("R", 2025, 2, "1369", "metaux_mineraux", 1, 1, 1, 12.0),  # arsenic au-dessus de la limite : publié
        ("R", 2025, 2, "1375", "metaux_mineraux", 1, 0, 1, 50.0),  # sodium quantifié, sans dépassement : écarté
        ("R", 2025, 2, "1302", "physico_chimie", 1, 0, 1, 7.5),    # pH : écarté
        ("R", 2024, 2, "1107", "pesticides", 1, 0, 1, 0.03),     # autre année : écartée
    ])
    assert B.series_publiees(con, 2025) == [
        ("035", "R", "1107", 4, 1, 0, 0.02),
        ("035", "R", "1107", 5, 1, 0, 0.0),
        ("035", "R", "1335", 2, 2, 0, 0.05),
        ("035", "R", "1369", 2, 1, 1, 12.0),
        ("035", "R", "6276", 3, 1, 0, 0.0),
    ]


def test_quatre_chiffres_significatifs():
    assert [B._sig(0.000834), B._sig(45.9), B._sig(123456.0), B._sig(None), B._sig(float("nan"))] == [0.000834, 45.9, 123500.0, None, None]
